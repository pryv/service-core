var async = require('async'),
    commonFns = require('./helpers/commonFunctions'),
    errorHandling = require('components/errors').errorHandling,
    methodsSchema = require('../schema/generalMethods'),
    _ = require('lodash');

/**
 * Utility API methods implementations.
 *
 * @param api
 */
module.exports = function (api, logging, storageLayer) {

  var logger = logging.getLogger('methods/batch');

  api.register('getAccessInfo',
    commonFns.getParamsValidation(methodsSchema.getAccessInfo.params),
    getAccessInfo);

  function getAccessInfo(context, params, result, next) {
    result.type = context.access.type;
    result.name = context.access.name;
    if (context.access.permissions) {
      result.permissions = context.access.permissions;
    }
    next();
  }

  api.register('callBatch',
    commonFns.getParamsValidation(methodsSchema.callBatch.params),
    callBatch);

  function callBatch(context, params, results, next) {
    results.results = [];
    async.forEachSeries(params, executeCall, next);

    function executeCall(call, done) {
      // clone context to avoid potential side FX
      var freshContext = _.extend(Object.create(Object.getPrototypeOf(context)), context);
      freshContext.retrieveStreams(storageLayer).then(() => {
        api.call(call.method, freshContext, call.params, function (err, result) {
          if (err) {
            // provide custom request context as we're outside of the usual error handling logic
            var reqContext = {
              method: call.method + ' (within batch)',
              url: 'pryv://' + context.username
            };
            errorHandling.logError(err, reqContext, logger);
            results.results.push({error: errorHandling.getPublicErrorData(err)});
            done();
          } else {
            result.toObject(function (object) {
              results.results.push(object);
              done();
            });
          }
        });
      });
    }
  }

};
module.exports.injectDependencies = true;
