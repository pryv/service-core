/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Some method used by events.get are shared with audit.getLogs
 */


const 
  streamsQueryUtils = require('./streamsQueryUtils'),
  _ = require('lodash'),    
  timestamp = require('unix-timestamp'),
  errors = require('errors').factory;

function coerceStreamsParam (context, params, result, next) {
  if (! params.streams)  {
    params.streams = null;
    return next();
  }
  // Streams query can also be sent as a JSON string or string of Array
  if (! context.acceptStreamsQueryNonStringified ||
     (context.acceptStreamsQueryNonStringified && typeof params.streams === 'string')) { // batchCall and socket.io can use plain JSON objects
    try {
      params.streams = parseStreamsQueryParam(params.streams);
    } catch (e) {
      return next(errors.invalidRequestStructure(
        'Invalid "streams" parameter. It should be an array of streamIds or JSON logical query' + e, params.streams));
    }
  }

   // Transform object or string to Array
  if (! Array.isArray(params.streams)) {
    params.streams = [params.streams];
  }

  next();

  function parseStreamsQueryParam(streamsParam) {
    if (typeof streamsParam === 'string') {
      if (['[', '{'].includes(streamsParam.substr(0, 1))) { // we detect if it's JSON by looking at first char
        // Note: since RFC 7159 JSON can also starts with ", true, false or number - this does not apply in this case.
        try {
          streamsParam = JSON.parse(streamsParam);
        } catch (e) {
          throw ('Error while parsing JSON ' + e);
        }
      }
    }
    return streamsParam
  }
}


function transformArrayOfStringsToStreamsQuery (context, params, result, next) {
  if (params.streams === null) return next();
  try {
    params.streams = streamsQueryUtils.transformArrayOfStringsToStreamsQuery(params.streams);
  } catch (e) {
    return next(errors.invalidRequestStructure(e, params.streams));
  }
  next();
}

function validateStreamsQuery (context, params, result, next) {
  if (params.streams === null) return next();
  try {
    streamsQueryUtils.validateStreamsQuery(params.streams);
  } catch (e) {
    return next(errors.invalidRequestStructure('Initial filtering: ' + e, params.streams));
  }
  next();
}

async function applyDefaultsForRetrieval (context, params, result, next) {
  _.defaults(params, {
    streams: null,
    tags: null,
    types: null,
    fromTime: null,
    toTime: null,
    sortAscending: false,
    skip: null,
    limit: null,
    state: 'default',
    modifiedSince: null,
    includeDeletions: false
  }); 
  if (params.fromTime == null && params.toTime != null) {
    params.fromTime = timestamp.add(params.toTime, -24 * 60 * 60);
  }
  if (params.fromTime != null && params.toTime == null) {
    params.toTime = timestamp.now();
  }
  if (params.fromTime == null && params.toTime == null && params.limit == null) {
    // limit to 20 items by default
    params.limit = 20;
  }
  next();
}

module.exports = {
  coerceStreamsParam,
  applyDefaultsForRetrieval,
  validateStreamsQuery,
  transformArrayOfStringsToStreamsQuery
}