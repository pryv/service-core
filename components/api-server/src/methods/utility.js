// @flow

const commonFns = require('./helpers/commonFunctions');
const errorHandling = require('components/errors').errorHandling;
const methodsSchema = require('../schema/generalMethods');
const _ = require('lodash');
const bluebird = require('bluebird');
const async = require('async');

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

  function callBatch(context, calls, results, next) {
    results.results = [];
    async.forEachSeries(calls, executeCall, next);
  
    async function executeCall(call) {
      // Clone context to avoid potential side effects
      const freshContext = _.cloneDeep(context);
      try {
        // Reload streams tree since a previous call in this batch
        // may have created a new stream.
        await freshContext.retrieveStreams(storageLayer);
        // Perform API call
        const result = await bluebird.fromCallback(
          (cb) => api.call(call.method, freshContext, call.params, cb));
        
        const object = await bluebird.fromCallback(
          (cb) => result.toObject(cb));
        results.results.push(object);
      } catch(err) {
        // Batchcalls have specific error handling hence the custom request context
        const reqContext = {
          method: call.method + ' (within batch)',
          url: 'pryv://' + context.username
        };
        errorHandling.logError(err, reqContext, logger);
        results.results.push({error: errorHandling.getPublicErrorData(err)});
      }
    }
  }

};
module.exports.injectDependencies = true;
