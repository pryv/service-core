// @flow

const bluebird = require('bluebird');
const socketIO = require('socket.io');

const MethodContext = require('components/model').MethodContext;

const Manager = require('./Manager');
const Paths = require('../routes/Paths');

const ChangeNotifier = require('./change_notifier');
const NatsPublisher = require('./nats_publisher');

// MONKEY PATCH Add support for wildcard event
//
// Delivers each packet twice to all message handlers: once using the 
// real endpoint given, once to the endpoint called '*'.
//
function onClientMessage(id, packet) {
  if (this.namespaces[packet.endpoint]) {
    this.namespaces[packet.endpoint].handlePacket(id, packet);
    // BEGIN: Wildcard patch
    if (packet.type === 'event') {
      const packet2 = JSON.parse(JSON.stringify(packet));
      packet2.name = '*';
      packet2.args = { name: packet.name, args: packet2.args };

      this.namespaces[packet.endpoint].handlePacket(id, packet2);
    }
    // END: Wildcard patch
  }
}
socketIO.Manager.prototype.onClientMessage = onClientMessage;

import type { Logger } from 'components/utils';
import type { StorageLayer } from 'components/storage';
import type { CustomAuthFunction } from 'components/model';

import type API from '../API';
import type { SocketIO$Handshake } from './Manager';

// Initializes the SocketIO subsystem. 
//
function setupSocketIO(
  server: net$Server, logger: Logger, 
  notifications: EventEmitter, api: API, 
  storageLayer: StorageLayer, 
  customAuthStepFn: ?CustomAuthFunction, 
) {
  const io = socketIO.listen(server, {
    resource: Paths.SocketIO,
    logger: logger,
    authorization: authorizeUserMiddleware, 
  });

  // Manages socket.io connections and delivers method calls to the api. 
  const manager: Manager = new Manager(logger, io, api);
  
  // Setup the chain from notifications -> NATS
  const natsPublisher = new NatsPublisher('nats://127.0.0.1:4222');
  const changeNotifier = new ChangeNotifier(natsPublisher);
  changeNotifier.listenTo(notifications);
  
  async function authorizeUserMiddleware(
    handshake: SocketIO$Handshake, callback: (err: any, res: any) => mixed
  ) {
    const nsName = handshake.query.resource;
    if (nsName == null) return callback("Missing 'resource' parameter.");
    
    const userName = manager.extractUsername(nsName); 
    if (userName == null) return callback(`Invalid resource "${nsName}".`);

    const accessToken = handshake.query.auth;
    if (accessToken == null) 
      return callback("Missing 'auth' parameter with a valid access token.");

    const context = new MethodContext(
      userName, accessToken, 
      customAuthStepFn);
      
    // HACK Attach our method context to the handshake as a means of talking to
    // the code in Manager. 
    handshake.methodContext = context;

    try {
      // Load user, init the namespace
      await context.retrieveUser(storageLayer);
      if (context.user == null) throw new Error('AF: context.user != null');
      manager.ensureInitNamespace(nsName, context.user); 
      // Load access
      await context.retrieveExpandedAccess(storageLayer);
      callback(null, true);
    } catch (err) {
      callback(err);
    }
  }
}
module.exports = setupSocketIO; 
