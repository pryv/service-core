var MethodContext = require('components/model').MethodContext;

/**
 * Returns a middleware function that initializes the method context into `req.context`.
 * The context is initialized with the user (loaded from username) and the access token.
 * The access itself is **not** loaded from token here as it may be modified in the course of
 * method execution, for example when calling a batch of methods. It is the API methods'
 * responsibility to load the access when needed.
 *
 * @param {Object} usersStorage
 * @param {Object} userAccessesStorage
 * @param {Object} sessionsStorage
 * @param {Object} userStreamsStorage
 */
module.exports = function initContext(usersStorage, userAccessesStorage, sessionsStorage,
                                      userStreamsStorage, customExtensionsSettings) {
  var storage = {
    users: usersStorage,
    accesses: userAccessesStorage,
    sessions: sessionsStorage,
    streams: userStreamsStorage
  };
  return function (req, res, next) {
    req.context = new MethodContext(req.params.username,
        req.headers.authorization || req.query.auth, storage,
        customExtensionsSettings.customAuthStepFn);
    req.context.retrieveUser(next);
  };
};
module.exports.injectDependencies = true; // make it DI-friendly
