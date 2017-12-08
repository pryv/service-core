// @flow

const socketIO = require('socket.io');

const MethodContext = require('components/model').MethodContext;

const Manager = require('./Manager');
const ChangeNotifier = require('./change_notifier');
const Paths = require('../routes/Paths');


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
  server: http$Server, logger: Logger, 
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
  
  // Manages change notifications.
  const changeNotifier = new ChangeNotifier();
  changeNotifier.addSink(manager);
  
  // Listen to messages that we need to notify socket.io clients about. 
  changeNotifier.listenTo(notifications);
  
  function authorizeUserMiddleware(
    handshake: SocketIO$Handshake, callback: (err: any, res: any) => mixed
  ) {
    const nsName = handshake.query.resource;
    if (nsName == null) return callback('Missing \'resource\' parameter.');
    
    const userName = manager.extractUsername(nsName); 
    if (userName == null) return callback(`Invalid resource "${nsName}".`);

    const accessToken = handshake.query.auth;
    if (accessToken == null) 
      return callback('Missing \'auth\' parameter with a valid access token.');

    const context = new MethodContext(
      userName, accessToken, 
      storageLayer, customAuthStepFn);
      
    // HACK Attach our method context to the handshake as a means of talking to
    // the code in Manager. 
    handshake.methodContext = context;

    // Attempt to reuse the user object we previously loaded for the given 
    // `nsName` namespace. 
    const cachedUser = manager.getUser(nsName);
    if (cachedUser != null) {
      // FLOW We should not piggy-back on the method context here.
      context.user = cachedUser; 
      return userLoaded(); 
    }
    
    // User wasn't cached, load it. 
    return context.retrieveUser(userLoaded);
      
    function userLoaded(err) {
      if (err != null) { return callback(err); }
      
      // FLOW We should not piggy-back on the method context here.
      manager.ensureInitNamespace(nsName, context.user);
      return callback(null, true);
    }
  }
}
module.exports = setupSocketIO; 
