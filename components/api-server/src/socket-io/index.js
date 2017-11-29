// @flow

const socketIO = require('socket.io');

const MethodContext = require('components/model').MethodContext;

const Manager = require('./Manager');
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
import type API from '../API';
import type { StorageLayer } from '../server';

import type { SocketIO$Handshake } from './Manager';

// Initializes the SocketIO subsystem. 
//
function setupSocketIO(
  server: http$Server, logger: Logger, 
  notifications: EventEmitter, api: API, 
  storageLayer: StorageLayer, 
  customAuthStepFn: Function, 
) {
  const io = socketIO.listen(server, {
    resource: Paths.SocketIO,
    logger: logger,
    authorization: authorizeUserMiddleware, 
  });

  var manager: Manager = new Manager(logger, io, api, notifications);
  
  function authorizeUserMiddleware(
    handshake: SocketIO$Handshake, callback: (err: any, res: any) => mixed
  ) {
    var nsName = handshake.query.resource;
    if (! nsName) {
      return callback('Missing \'resource\' parameter.');
    }
    
    if (!nsName.startsWith('/') ||
      !manager.looksLikeUsername(nsName.slice(1))) {
      // invalid namespace
      return callback('Invalid resource "' + nsName + '".');
    }

    var username = manager.extractUsername(nsName);

    var accessToken = handshake.query.auth;
    if (! accessToken) {
      return callback('Missing \'auth\' parameter with a valid access token.');
    }

    const context = new MethodContext(
      username, accessToken, 
      storageLayer, customAuthStepFn);
      
    // HACK Attach our method context to the handshake as a means of talking to
    // the code in Manager. 
    handshake.methodContext = context;

    if (manager.hasContextForNamespace(nsName)) {
      // We've cached the user per namespace, so we avoid loading it here. 
      context.user = manager.getUser(nsName);
      done();
    } else {
      context.retrieveUser(done);
    }

    function done(err) {
      if (err) { return callback(err); }
      manager.ensureInitNamespace(nsName, context.user);
      callback(null, true);
    }
  }
}
module.exports = setupSocketIO; 
