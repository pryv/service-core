var MethodContext = require('components/model').MethodContext,
    Manager = require('./Manager'),
    socketIO = require('socket.io'),
    Paths = require('../routes/Paths');


// Add support for wildcard event
socketIO.Manager.prototype.onClientMessage = function onClientMessage(id, packet) {
  if (this.namespaces[packet.endpoint]) {
    this.namespaces[packet.endpoint].handlePacket(id, packet);
    // BEGIN: Wildcard patch
    if (packet.type === 'event') {
      var packet2 = JSON.parse(JSON.stringify(packet));
      packet2.name = '*';
      packet2.args = { name: packet.name, args: packet2.args };

      this.namespaces[packet.endpoint].handlePacket(id, packet2);
    }
    // END: Wildcard patch
  }
};

/**
 * Initializes and configures Socket.IO.
 *
 * @param server
 * @param usersStorage
 * @param userAccessesStorage
 * @param userStreamsStorage
 * @param notifications
 * @param api
 */
module.exports = function (server, usersStorage, userAccessesStorage, sessionsStorage,
                           userStreamsStorage, notifications, api, logging,
                           customExtensionsSettings) {

  var io = socketIO.listen(server, {
    resource: Paths.SocketIO,
    logger: logging.getLogger('socket.io'),
    authorization: function (handshakeData, callback) {
      var nsName = handshakeData.query.resource;
      if (! nsName) {
        return callback('Missing \'resource\' parameter.');
      }

      if (! manager.isValidNamespace(nsName)) {
        // invalid namespace
        return callback('Invalid resource "' + nsName + '".');
      }

      var username = manager.getUsername(nsName);

      var accessToken = handshakeData.query.auth;

      if (! accessToken) {
        return callback('Missing \'auth\' parameter with a valid access token.');
      }

      var context = new MethodContext(username, accessToken, {
        users: usersStorage,
        accesses: userAccessesStorage,
        sessions: sessionsStorage,
        streams: userStreamsStorage
      }, customExtensionsSettings.customAuthStepFn);
      handshakeData.context = context;

      if (manager.namespaceExists(nsName)) {
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
  });

  var manager = new Manager(io, notifications, api, logging);
};
module.exports.injectDependencies = true;
