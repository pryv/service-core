/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

//@flow

const errors = require('errors').factory;
const async = require('async');
const commonFns = require('api-server/src/methods/helpers/commonFunctions');
const methodsSchema = require('../schema/auditMethods');
const eventsGetUtils = require('api-server/src/methods/helpers/eventsGetUtils');

import type { GetEventsParams } from 'api-server/src/methods/helpers/eventsGetUtils';

const audit = require('audit');
const auditStorage = audit.storage;

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
}

/**
 * 
 */
function anyStarStreamQueryIsNullQUery(context, params, result, next) {
  if (isStar(params.arrayOfStreamQueries)) {
    params.arrayOfStreamQueries = null;
  }
  next();

  /**
   * arrayOfStreamQueries === [{ any: ['*']}]
   * @param {*} arrayOfStreamQueries 
   */
  function isStar(arrayOfStreamQueries) {
    return params.arrayOfStreamQueries.length === 1 && 
    params.arrayOfStreamQueries[0]?.any?.length === 1 && 
    params.arrayOfStreamQueries[0]?.any[0] === '*';
  }
}


/**
 * Remove ':audit:' from stream query;
 * @returns 
 */
function removeStoreIdFromStreamQuery(context, params, result, next) {
  if (params.arrayOfStreamQueries == null) return next();
  for (let query of params.arrayOfStreamQueries) {
    for (let item of ['all', 'any', 'not']) {
      if (query[item] != null) {
        for (let i = 0; i < query[item].length ; i++) {
          const streamId = query[item][i];
          if (! streamId.startsWith(audit.CONSTANTS.STORE_PREFIX)) {
            return next(errors.invalidRequestStructure(
              'Invalid "streams" parameter. It should be an array of streamIds starting with Audit store prefix: "' + audit.CONSTANTS.STORE_PREFIX + '"', params.arrayOfStreamQueries));
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
  if (params.arrayOfStreamQueries == null) { params.arrayOfStreamQueries = [{}]; }

  // stream corresponding to acces.id exemple: "access-{acces.id}"
  const streamId = audit.CONSTANTS.ACCESS_STREAM_ID_PREFIX + context.access.id;

  for (const query of params.arrayOfStreamQueries) {
    if (! query.any) { 
      query.any = [streamId]
    } else {
      if (! query.all) { query.all = []}
      query.all.push({any: [streamId]});
    }
    
  }
  next();
}


// From storage
async function getAuditLogs(context, params, result, next) {
  try {
    const userStorage = await auditStorage.forUser(context.user.id);
    params.streams = params.arrayOfStreamQueries;
    result.addStream('auditLogs', userStorage.getLogsStream(params, true));
  } catch (err) {
    return next(err);
  }     
  next();
}


