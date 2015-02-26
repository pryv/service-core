var errorHandling = require('components/errors').errorHandling,
    errors = require('components/errors').factory,
    string = require('../utils/string'),
    timestamp = require('unix-timestamp');

/**
 * Call tracking functions, to be registered after all methods have been registered.
 *
 * @param api
 * @param userAccessesStorage
 */
module.exports = function (api, userAccessesStorage, logging) {

  var logger = logging.getLogger('methods/trackingFunctions');

  api.register('*',
      updateAccessUsageStats);

  function updateAccessUsageStats(context, params, result, next) {
    // don't make callers wait on this to get their reply
    next();

    var access = context.access;
    if (access) {
      var calledMethodKey = string.toMongoKey(context.calledMethodId),
          prevCallCount = (access.calls && access.calls[calledMethodKey]) ?
              access.calls[calledMethodKey] : 0;

      var update = {lastUsed: timestamp.now()};
      update['calls.' + calledMethodKey] = prevCallCount + 1;

      userAccessesStorage.update(context.user, {id: context.access.id}, update, function (err) {
        if (err) {
          errorHandling.logError(errors.unexpectedError(err), {
            url: context.user.username,
            method: 'updateAccessLastUsed',
            body: params
          }, logger);
        }
      });
    }
  }

};
module.exports.injectDependencies = true;
