var errorHandling = require('components/errors').errorHandling,
    setCommonMeta = require('../methods/helpers/setCommonMeta'),
    _ = require('lodash');

/**
 * Singleton for managing sockets access:
 *
 * - dynamic namespaces per user
 * - forwards data notifications to appropriate sockets
 */
module.exports = function Manager(io, notifications, api, logging) {
  var nsContexts = {},
      logger = logging.getLogger('sockets');

  this.isValidNamespace = function (name) {
    return (/^\/\w+$/).test(name);
  };

  // used by notifications (see below).
  function getNSContext(username) {
    return nsContexts['/' + username];
  }

  /**
   * Extracts the username from the given valid namespace name.
   */
  this.getUsername = function (namespaceName) {
    return namespaceName.split('/')[1];
  };

  this.namespaceExists = function (name) {
    return nsContexts.hasOwnProperty(name);
  };

  this.getUser = function (namespaceName) {
    return nsContexts[namespaceName].user;
  };

  /**
   * Sets up the namespace with the given name and user, if not already present.
   */
  this.ensureInitNamespace = function (name, user) {
    if (nsContexts[name]) {
      return; // already initialized
    }

    logger.debug('Initializing namespace "' + name + '"');

    var ns = io.of(name);
    var nsContext = {
      namespace: ns,
      user: user
    };
    nsContexts[name] = nsContext;
    nsContext.socketMethodContexts = {};

    ns.on('connection', onConnect);
  };

  function onConnect(socket) {
    var name = socket.namespace.name,
        nsContext = nsContexts[name];

    logger.debug('New client connected on namespace "' + name + '"');

    // retrieve data passed from authentication (handshake)
    nsContext.socketMethodContexts[socket.id] = io.handshaken[socket.id].context;

    socket.on('disconnect', onSocketDisconnect);

    socket.on('*', onSocketMethodCall);
  }

  /**
   * Requires that caller (`this`) is the socket.
   */
  function onSocketDisconnect() {
    var name = this.namespace.name,
        nsContext = nsContexts[name];

    logger.debug('Client disconnected from namespace "' + name + '"');

    delete nsContext.socketMethodContexts[this.id];

    if (_.isEmpty(nsContext.socketMethodContexts)) {
      logger.debug('Deleting unused namespace "' + name + '"');
      delete nsContexts[name];
      delete io.namespaces[name]; //TODO: make sure this is 100% safe (Socket.IO's internals)
    }
  }

  /**
   * Requires that caller (`this`) is the socket.
   */
  function onSocketMethodCall(callData, callback) {
    var nsContext = nsContexts[this.namespace.name],
        id = callData.name,
        params = callData.args[0];

    api.call(id, nsContext.socketMethodContexts[this.id], params, function (err, result) {
      if (err) {
        errorHandling.logError(err, {
          url: nsContext.user.username + nsContext.namespace.name,
          method: id,
          body: params
        }, logger);
        return callback(setCommonMeta({error: errorHandling.getPublicErrorData(err)}));
      }
      callback(null, setCommonMeta(result));
    });
  }

  notifications.on('accesses-changed', dataChangedFn('accessesChanged'));
  notifications.on('events-changed', dataChangedFn('eventsChanged'));
  notifications.on('streams-changed', dataChangedFn('streamsChanged'));

  function dataChangedFn(eventName) {
    return function (user) {
      emitEvent(user.username, eventName);
    };
  }

  function emitEvent(username, eventName, params) {
    var nsContext = getNSContext(username);
    if (! nsContext) { return; }
    nsContext.namespace.emit(eventName, params);
  }

};
