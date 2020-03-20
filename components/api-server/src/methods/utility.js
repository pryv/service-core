// @flow

const commonFns = require('./helpers/commonFunctions');
const errorHandling = require('components/errors').errorHandling;
const methodsSchema = require('../schema/generalMethods');
const _ = require('lodash');
const bluebird = require('bluebird');

import type API from '../API';
import type { Logger } from 'components/utils';
import type { StorageLayer } from 'components/storage';
import type { MethodContext } from 'components/model';
import type Result from '../Result';
import type { ApiCallback } from '../API';

type ApiCall = {
  method: string,
  params: mixed,
};

/**
 * Utility API methods implementations.
 *
 * @param api
 */
module.exports = function (api: API, logging: Logger, storageLayer: StorageLayer) {

  const logger = logging.getLogger('methods/batch');

  api.register('getAccessInfo',
    commonFns.getParamsValidation(methodsSchema.getAccessInfo.params),
    getAccessInfo);

  function getAccessInfo(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const accessInfoProps = ['id', 'token', 'type', 'name', 'deviceName', 'permissions',
      'lastUsed', 'expires', 'deleted', 'clientData',
      'created', 'createdBy', 'modified', 'modifiedBy', 'calls'
    ];
    for (const prop of accessInfoProps) {
      const accessProp = context.access[prop];
      if (accessProp != null) result[prop] = accessProp;
    }
    next();
  }

  api.register('callBatch',
    commonFns.getParamsValidation(methodsSchema.callBatch.params),
    callBatch);

  async function callBatch(context: MethodContext, calls: Array<ApiCall>, result: Result, next: ApiCallback) {

    let needRefeshForNextcall = true;
    let freshContext: MethodContext = null;
    let access = null;
    let streams = null;
    
    result.results = await bluebird.mapSeries(calls, executeCall);
    next();


    async function refreshContext() {
      // Clone context to avoid potential side effects
      freshContext = _.cloneDeep(context);
      access = freshContext.access;
      // Reload streams tree since a previous call in this batch
      // may have created a new stream.
      await freshContext.retrieveStreams(storageLayer);
      if (! access.isPersonal()) access.loadPermissions(freshContext.streams);
    }

    async function executeCall(call: ApiCall) {
      try {
        if (needRefeshForNextcall) {
          await refreshContext()
        }

        needRefeshForNextcall = ['streams.create', 'stream.update', 'stream.delete'].includes(call.method);

        // Perform API call
        const result: Result = await bluebird.fromCallback(
          (cb) => api.call(call.method, freshContext, call.params, cb));
        
        return await bluebird.fromCallback(
          (cb) => result.toObject(cb));
      } catch(err) {
        // Batchcalls have specific error handling hence the custom request context
        const reqContext = {
          method: call.method + ' (within batch)',
          url: 'pryv://' + context.username
        };
        errorHandling.logError(err, reqContext, logger);
        
        return {error: errorHandling.getPublicErrorData(err)};
      }
    }
  }

};
module.exports.injectDependencies = true;
