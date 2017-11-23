var errorHandling = require('components/errors').errorHandling,
    errors = require('components/errors').factory,
    string = require('./helpers/string'),
    timestamp = require('unix-timestamp');

/**
 * Call tracking functions, to be registered after all methods have been registered.
 *
 * @param api
 * @param userAccessesStorage
 * @param logging
 */
module.exports = function (api, userAccessesStorage, logging) {

  var logger = logging.getLogger('methods/trackingFunctions');

  api.register('*',
      updateAccessUsageStats);

  function updateAccessUsageStats(context, params, result, next) {
    // don't make callers wait on this to get their reply
    next();

    // handle own errors not to mess with "concurrent" code (because of next() above)
    try {
      var access = context.access;
      if (access) {
        const calledMethodKey = string.toMongoKey(context.calledMethodId);
        const prevCallCount = (access.calls && access.calls[calledMethodKey]) ?
          access.calls[calledMethodKey] : 
          0;

        const update = { lastUsed: timestamp.now() };
        update['calls.' + calledMethodKey] = prevCallCount + 1;

        userAccessesStorage.updateOne(context.user, {id: context.access.id}, update, function (err) {
          if (err) {
            errorHandling.logError(errors.unexpectedError(err), {
              url: context.user.username,
              method: 'updateAccessLastUsed',
              body: params
            }, logger);
          }
        });
      }
    } catch (err) {
      errorHandling.logError(errors.unexpectedError(err), {
        url: context.user.username,
        method: 'updateAccessLastUsed',
        body: params
      }, logger);
    }
  }

};
module.exports.injectDependencies = true;
