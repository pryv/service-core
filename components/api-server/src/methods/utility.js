/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const commonFns = require('./helpers/commonFunctions');
const errorHandling = require('errors').errorHandling;
const methodsSchema = require('../schema/generalMethods');
const _ = require('lodash');
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getLogger, getConfig } = require('@pryv/boiler');

import type API  from '../API';
import type { MethodContext } from 'business';
import type Result  from '../Result';
import type { ApiCallback }  from '../API';

const { Permission } = require('business/src/accesses');

type ApiCall = {
  method: string,
  params: mixed,
};

/**
 * Utility API methods implementations.
 *
 * @param api
 */
module.exports = async function (api: API) {

  const logger = getLogger('methods:batch');
  const config = await getConfig();

  const isOpenSource = config.get('openSource:isActive');
  const isAuditActive = (! isOpenSource) && config.get('audit:active');
  let audit;
  if (isAuditActive) {
    audit = require('audit');
  }
  api.register('getAccessInfo',
    commonFns.getParamsValidation(methodsSchema.getAccessInfo.params),
    getAccessInfoApiFn);

  function getAccessInfoApiFn(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const accessInfoProps: Array<string> = ['id', 'token', 'type', 'name', 'deviceName', 'permissions',
      'lastUsed', 'expires', 'deleted', 'clientData',
      'created', 'createdBy', 'modified', 'modifiedBy', 'calls'
    ];
    const userProps: Array<string> = ['username'];
    
    for (const prop of accessInfoProps) {
      const accessProp = context.access[prop];
      if (accessProp != null) result[prop] = accessProp;
    }

    if (result.permissions != null) result.permissions = filterNonePermissionsOnSystemStreams(result.permissions);

    result.user = {};
    for (const prop of userProps) {
      const userProp = context.user[prop];
      if (userProp != null) result.user[prop] = userProp;
    }
  
    next();

    /**
     * Remove permissions with level="none" from given array
     */
    function filterNonePermissionsOnSystemStreams(permissions: Array<Permission>): Array<Permission> {
      const filteredPermissions: Array<Permission> = [];
      for (const perm of permissions) {
        if (perm.level !== 'none' && (! SystemStreamsSerializer.isSystemStreamId(perm.streamId))) filteredPermissions.push(perm);
      }
      return filteredPermissions;
    }
  }

  api.register('callBatch',
    commonFns.getParamsValidation(methodsSchema.callBatch.params),
    callBatchApiFn);

  async function callBatchApiFn(context: MethodContext, calls: Array<ApiCall>, result: Result, next: ApiCallback) {
    // allow non stringified stream queries in batch calls 
    context.acceptStreamsQueryNonStringified = true;

    result.results = await bluebird.mapSeries(calls, executeCall);
    next();

    async function executeCall(call: ApiCall) {
      try {
        // update methodId to match the call todo
        context.methodId = call.method;
        // Perform API call
        const result: Result = await bluebird.fromCallback(
          (cb) => api.call(context, call.params, cb));
        
        if (isAuditActive) await audit.validApiCall(context, result);

        return await bluebird.fromCallback(
          (cb) => result.toObject(cb));
      } catch(err) {
        // Batchcalls have specific error handling hence the custom request context
        const reqContext = {
          method: call.method + ' (within batch)',
          url: 'pryv://' + context.user.username
        };
        errorHandling.logError(err, reqContext, logger);

        if (isAuditActive) await audit.errorApiCall(context, err);
        
        return {error: errorHandling.getPublicErrorData(err)};
      }
    }
  }

};
