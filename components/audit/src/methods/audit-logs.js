/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('errors').factory,
  async = require('async'),
  commonFns = require('api-server/src/methods/helpers/commonFunctions'),
  methodsSchema = require('../schema/auditMethods'),
  eventsGetUtils = require('api-server/src/methods/helpers/eventsGetUtils');

const audit = require('audit');
const auditStorage = audit.storage;

/**
* @param api
*/
module.exports = function (api) {
  api.register('audit.getLogs',
    eventsGetUtils.coerceStreamsParam,
    commonFns.getParamsValidation(methodsSchema.get.params),
    eventsGetUtils.transformArrayOfStringsToStreamsQuery,
    anyStarStreamQueryIsNullQUery,
    removeStoreIdFromStreamQuery,
    limitStreamQueryToAccessToken,
    getAuditLogs);
}

/**
 * params?.streams === [{ any: ['*']}]
 */
function anyStarStreamQueryIsNullQUery(context, params, result, next) {
  if (params.streams &&
    params.streams.length === 1 && 
    params.streams[0].any && 
    params.streams[0].any.length === 1 && 
    params.streams[0].any[0] === '*') {
      params.streams = null;
    }
  return next();
}


/**
 * Remove ':audit:' from stream query;
 * @returns 
 */
function removeStoreIdFromStreamQuery(context, params, result, next) {
  if (params.streams == null) return next();
  for (let query of params.streams) {
    for (let item of ['all', 'any', 'not']) {
      if (query[item] != null) {
        for (let i = 0; i < query[item].length ; i++) {
          const streamId = query[item][i];
          if (! streamId.startsWith(audit.CONSTANTS.STORE_PREFIX)) {
            return next(errors.invalidRequestStructure(
              'Invalid "streams" parameter. It should be an array of streamIds starting with Audit store prefix: "' + audit.CONSTANTS.STORE_PREFIX + '"', params.streams));
          }
          query[item][i] = streamId.substring(audit.CONSTANTS.STORE_PREFIX.length);
        }
      }
    }
  }
  next();
}

function limitStreamQueryToAccessToken(context, params, result, next) {
  if (context.access.isPersonal()) return next();
  if (params.streams == null) { params.streams = [{}]; }

  // stream corresponding to acces.id exemple: "access-{acces.id}"
  const streamId = audit.CONSTANTS.ACCESS_STREAM_ID_PREFIX + context.access.id;

  for (const query of params.streams) {
    if (! query.all) { query.all = []}
    query.all.push(streamId);
  }
  next();
}


// From storage
async function getAuditLogs(context, params, result, next) {
  try {
    const userStorage = await auditStorage.forUser(context.user.id);
    result.addStream('auditLogs', userStorage.getLogsStream(params, true));
    //result.auditLogs = userStorage.getLogs(params);
  } catch (err) {
    return next(err);
  }     
  next();
}


