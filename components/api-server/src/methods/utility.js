var async = require('async'),
    commonFns = require('./commonFunctions'),
    errorHandling = require('components/errors').errorHandling,
    methodsSchema = require('../schema/generalMethods'),
    _ = require('lodash');

/**
 * Utility API methods implementations.
 *
 * @param api
 */
module.exports = function (api, logging) {

  var logger = logging.getLogger('methods/batch');

  api.register('getAccessInfo',
      //TODO: optimize by only loading the access itself (no need for expansion etc.)
      commonFns.loadAccess,
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
      api.call(call.method, freshContext, call.params, function (err, result) {
        if (err) {
          // provide custom request context as we're outside of the usual error handling logic
          var reqContext = {
            method: call.method + ' (within batch)',
            url: 'pryv://' + context.username
          };
          errorHandling.logError(err, reqContext, logger);
          results.results.push({error: errorHandling.getPublicErrorData(err)});
        } else {
          results.results.push(result);
        }
        done();
      });
    }
  }

};
module.exports.injectDependencies = true;
