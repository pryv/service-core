/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('errors').factory;
const commonFns = require('api-server/src/methods/helpers/commonFunctions');
const methodsSchema = require('../schema/auditMethods');
const eventsGetUtils = require('api-server/src/methods/helpers/eventsGetUtils');
const { getStoreQueryFromParams } = require('mall/src/helpers/eventsQueryUtils');
const audit = require('audit');
const auditStorage = audit.storage;
const { ConvertEventFromStoreStream } = require('mall/src/helpers/eventsUtils');
/**
 * @param api
 */
module.exports = function (api) {
  api.register('audit.getLogs',
    eventsGetUtils.coerceStreamsParam,
    commonFns.getParamsValidation(methodsSchema.get.params),
    eventsGetUtils.applyDefaultsForRetrieval,
    eventsGetUtils.transformArrayOfStringsToStreamsQuery,
    anyStarStreamQueryIsNullQUery,
    removeStoreIdFromStreamQuery,
    limitStreamQueryToAccessToken,
    getAuditLogs);
};
/**
 * @returns {void}
 */
function anyStarStreamQueryIsNullQUery (context, params, result, next) {
  if (isStar(params.arrayOfStreamQueries)) {
    params.arrayOfStreamQueries = null;
  }
  next();
  /**
   * arrayOfStreamQueries === [{ any: ['*']}]
   * @param {*} arrayOfStreamQueries
   */
  function isStar (arrayOfStreamQueries) {
    return (params.arrayOfStreamQueries.length === 1 &&
            params.arrayOfStreamQueries[0]?.any?.length === 1 &&
            params.arrayOfStreamQueries[0]?.any[0] === '*');
  }
}
/**
 * Remove ':audit:' from stream query;
 * @returns {any}
 */
function removeStoreIdFromStreamQuery (context, params, result, next) {
  if (params.arrayOfStreamQueries == null) { return next(); }
  for (const query of params.arrayOfStreamQueries) {
    for (const item of ['all', 'any', 'not']) {
      if (query[item] != null) {
        const streamIds = query[item];
        for (let i = 0; i < streamIds.length; i++) {
          const streamId = streamIds[i];
          if (!streamId.startsWith(audit.CONSTANTS.STORE_PREFIX)) {
            return next(errors.invalidRequestStructure('Invalid "streams" parameter. It should be an array of streamIds starting with Audit store prefix: "' +
                            audit.CONSTANTS.STORE_PREFIX +
                            '"', params.arrayOfStreamQueries));
          }
          streamIds[i] = streamId.substring(audit.CONSTANTS.STORE_PREFIX.length);
        }
      }
    }
  }
  next();
}
/**
 * @returns {any}
 */
function limitStreamQueryToAccessToken (context, params, result, next) {
  if (context.access.isPersonal()) { return next(); }
  if (params.arrayOfStreamQueries == null) {
    params.arrayOfStreamQueries = [{}];
  }
  // stream corresponding to acces.id exemple: "access-{acces.id}"
  const streamId = audit.CONSTANTS.ACCESS_STREAM_ID_PREFIX + context.access.id;
  for (const query of params.arrayOfStreamQueries) {
    if (query.any == null) {
      query.any = [streamId];
    } else {
      if (query.and == null) {
        query.and = [];
      }
      query.and.push({ any: [streamId] });
    }
  }
  next();
}
// From storage
/**
 * @returns {Promise<any>}
 */
async function getAuditLogs (context, params, result, next) {
  try {
    const userStorage = await auditStorage.forUser(context.user.id);
    params.streams = params.arrayOfStreamQueries;
    const query = getStoreQueryFromParams(params);
    result.addStream('auditLogs', userStorage
      .getEventsStream(query)
      .pipe(new ConvertEventFromStoreStream('_audit')));
  } catch (err) {
    return next(err);
  }
  next();
}
