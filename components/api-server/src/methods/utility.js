/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const commonFns = require('./helpers/commonFunctions');
const errorHandling = require('errors').errorHandling;
const methodsSchema = require('../schema/generalMethods');
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getLogger, getConfig } = require('@pryv/boiler');
const { getPasswordRules } = require('business/src/users');
const updateAccessUsageStats = require('./helpers/updateAccessUsageStats');
/**
 * Utility API methods implementations.
 *
 * @param api
 */
module.exports = async function (api) {
  const logger = getLogger('methods:batch');
  const config = await getConfig();
  const isOpenSource = config.get('openSource:isActive');
  const isAuditActive = !isOpenSource && config.get('audit:active');
  const updateAccessUsage = await updateAccessUsageStats();
  const passwordRules = await getPasswordRules();
  let audit;
  if (isAuditActive) {
    audit = require('audit');
  }
  api.register('getAccessInfo', commonFns.getParamsValidation(methodsSchema.getAccessInfo.params), getAccessInfoApiFn);
  async function getAccessInfoApiFn (context, params, result, next) {
    const accessInfoProps = [
      'id',
      'token',
      'type',
      'name',
      'deviceName',
      'permissions',
      'lastUsed',
      'expires',
      'deleted',
      'clientData',
      'created',
      'createdBy',
      'modified',
      'modifiedBy',
      'calls'
    ];
    const userProps = ['username'];
    for (const prop of accessInfoProps) {
      const accessProp = context.access[prop];
      if (accessProp != null) { result[prop] = accessProp; }
    }
    if (result.permissions != null) { result.permissions = filterNonePermissionsOnSystemStreams(result.permissions); }
    result.user = {};
    for (const prop of userProps) {
      const userProp = context.user[prop];
      if (userProp != null) { result.user[prop] = userProp; }
    }
    if (context.access.isPersonal()) {
      const expirationAndChangeTimes = await passwordRules.getPasswordExpirationAndChangeTimes(context.user.id);
      Object.assign(result.user, expirationAndChangeTimes);
    }
    next();
    /**
     * Remove permissions with level="none" of system streams from given array
     */
    function filterNonePermissionsOnSystemStreams (permissions) {
      const filteredPermissions = [];
      for (const perm of permissions) {
        if (!(perm.level === 'none' &&
                    SystemStreamsSerializer.isSystemStreamId(perm.streamId))) { filteredPermissions.push(perm); }
      }
      return filteredPermissions;
    }
  }
  api.register('callBatch', commonFns.getParamsValidation(methodsSchema.callBatch.params), callBatchApiFn, updateAccessUsage);
  async function callBatchApiFn (context, calls, result, next) {
    // allow non stringified stream queries in batch calls
    context.acceptStreamsQueryNonStringified = true;
    context.disableAccessUsageStats = true;
    // to avoid updatingAccess for each api call we are collecting all counter here
    context.accessUsageStats = {};
    function countCall (methodId) {
      if (context.accessUsageStats[methodId] == null) { context.accessUsageStats[methodId] = 0; }
      context.accessUsageStats[methodId]++;
    }
    result.results = await bluebird.mapSeries(calls, executeCall);
    context.disableAccessUsageStats = false; // to allow tracking functions
    next();
    async function executeCall (call) {
      try {
        countCall(call.method);
        // update methodId to match the call todo
        context.methodId = call.method;
        // Perform API call
        const result = await bluebird.fromCallback((cb) => api.call(context, call.params, cb));
        if (isAuditActive) { await audit.validApiCall(context, result); }
        return await bluebird.fromCallback((cb) => result.toObject(cb));
      } catch (err) {
        // Batchcalls have specific error handling hence the custom request context
        const reqContext = {
          method: call.method + ' (within batch)',
          url: 'pryv://' + context.user.username
        };
        errorHandling.logError(err, reqContext, logger);
        if (isAuditActive) { await audit.errorApiCall(context, err); }
        return { error: errorHandling.getPublicErrorData(err) };
      }
    }
  }
};

/**
 * @typedef {{
 *   method: string;
 *   params: unknown;
 * }} ApiCall
 */
