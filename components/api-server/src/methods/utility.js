/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const commonFns = require('./helpers/commonFunctions');
const errorHandling = require('errors').errorHandling;
const methodsSchema = require('../schema/generalMethods');
const _ = require('lodash');
const bluebird = require('bluebird');

const { getLogger } = require('@pryv/boiler');

import type API  from '../API';
import type { StorageLayer } from 'storage';
import type { MethodContext } from 'model';
import type Result  from '../Result';
import type { ApiCallback }  from '../API';

type ApiCall = {
  method: string,
  params: mixed,
};

/**
 * Utility API methods implementations.
 *
 * @param api
 */
module.exports = function (api: API, logging, storageLayer: StorageLayer) {

  const logger = getLogger('methods:batch');

  api.register('getAccessInfo',
    commonFns.getParamsValidation(methodsSchema.getAccessInfo.params),
    getAccessInfo);

  function getAccessInfo(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const accessInfoProps = ['id', 'token', 'type', 'name', 'deviceName', 'permissions',
      'lastUsed', 'expires', 'deleted', 'clientData',
      'created', 'createdBy', 'modified', 'modifiedBy', 'calls'
    ];
    const userProps = ['username'];
    
    for (const prop of accessInfoProps) {
      const accessProp = context.access[prop];
      if (accessProp != null) result[prop] = accessProp;
    }

    result.user = {};
    for (const prop of userProps) {
      const userProp = context.user[prop];
      if (userProp != null) result.user[prop] = userProp;
    }
  
    next();
  }

  api.register('callBatch',
    commonFns.getParamsValidation(methodsSchema.callBatch.params),
    callBatch);

  async function callBatch(context: MethodContext, calls: Array<ApiCall>, result: Result, next: ApiCallback) {

    let needRefeshForNextcall = true;
    let freshContext: MethodContext = null;
    
    result.results = await bluebird.mapSeries(calls, executeCall);
    next();


    // Reload streams tree since a previous call in this batch
    // may have modified stream structure.
    async function refreshContext() {
      // Clone context to avoid potential side effects
      freshContext = _.cloneDeep(context);
      // Accept streamQueries in JSON format for batchCalls
      freshContext.acceptStreamsQueryNonStringified = true;
      const access = freshContext.access;
      await freshContext.retrieveStreams(storageLayer);
      if (! access.isPersonal()) access.loadPermissions(freshContext.streams);
    }

    async function executeCall(call: ApiCall) {
      try {
        if (needRefeshForNextcall) {
          await refreshContext();
        }

        needRefeshForNextcall = ['streams.create', 'streams.update', 'streams.delete'].includes(call.method);

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
