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
  errors = require('errors').factory,
  { getStores, StreamsUtils } = require('stores'),
  { treeUtils } = require('utils');

let stores;

/**
 *  # Stream Query Flow 
 *  1. coerceStreamParam:
 *    - null `streams` is changed to `[{any: ['*]}]
 *    - transform "stringified" `streams` by parsing JSON object
 * 
 *  2. transformArrayOfStringsToStreamsQuery:
 *    For backwardCompatibility with older streams parameter ['A', 'B'] 
 *    - `streams: ['A', 'B', 'C']` => `streams: [{any: 'A'}, {any: 'B'}, {any: 'C'}]`
 * 
 *  3. validateStreamsQueriesAndSetStore:
 *    - Check syntax and add storeId 
 *      `streams: [{any: 'A'}, {any: ':_audit:B'}]` => `streams: [{any: 'A', storeId: 'local'}, {any: 'B', storeId: 'audit'}]`
 * 
 *  4. streamQueryCheckPermissionsAndReplaceStars:
 *    For `stream.any`ONLY ! (we don't have to check NOT and ALL query as they only reduce scope)  
 *    - check if stream exits and if has "read" access 
 *    - If "stream.any" contains  "*" it's replaced by all root streams with "read" rights
 *   
 *  5. streamQueryAddForcedAndForbiddenStreams
 *    - Add to streams query `all` streams declared as "forced"
 *    - Add to streams query `not` streams that must not be exposed permissions => with level = "none"
 *   
 *  6. streamQueryExpandStreams
 *    - Each "streamId" of the queries is "expanded" (i.e. transformed in an array of streamId that includes the streams and it's chidlren)
 *    - Do not expand streams prefixed with a "#" 
 *       
 *    - A callBack `expandStreamInContext`is used to link the expand process and the "stores"
 *      This callBack is designed to be optimized on a Per-Store basis The current implementation is generic
 *      - If streamId is prefixed with a "#" just return the streamId without "#"
 *      - It queries the stores with and standard `stores.streams.get({id: streamId, exludedIds: [....]})` 
 *        and return an array of streams.
 * 
 *    - streamsQueryUtils.expandAndTransformStreamQueries
 *      Is in charge of handling 'any', 'all' and 'not' "expand" process
 * 
 *      - "any" is expanded first excluding streamIds in "not"
 *          => The result is kept in `any`
 *      - "all" is expanded in second excluding streamIds in "not"
 *          `all` is tranformed and each "expansion" is kept in `and: [{any: ,..}]`
 *          example: `{all: ['A', 'B']}` => `{and: [{any: [...expand('A')]}, {any: [...expand('B')]}]}`
 *      - "not" is expanded in third and added to `and` as:
 *          example: `{all: ['A'], not['B', 'C']}` =>  `{and: [{any: [...expand('A')]}, {not: [...expand('B')...expand('C')]}]}
 * 
 */

function coerceStreamsParam(context, params, result, next) {
  if (!params.streams) {
    params.streams = [{ any: ['*'] }];
    return next();
  }
  // Streams query can also be sent as a JSON string or string of Array
  if (!context.acceptStreamsQueryNonStringified ||
    (context.acceptStreamsQueryNonStringified && typeof params.streams === 'string')) { // batchCall and socket.io can use plain JSON objects
    try {
      params.streams = parseStreamsQueryParam(params.streams);
    } catch (e) {
      return next(errors.invalidRequestStructure(
        'Invalid "streams" parameter. It should be an array of streamIds or JSON logical query' + e, params.streams));
    }
  }

  // Transform object or string to Array
  if (!Array.isArray(params.streams)) {
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


function transformArrayOfStringsToStreamsQuery(context, params, result, next) {
  if (params.streams === null) return next();
  try {
    params.streams = streamsQueryUtils.transformArrayOfStringsToStreamsQuery(params.streams);
  } catch (e) {
    return next(errors.invalidRequestStructure(e, params.streams));
  }
  next();
}

function validateStreamsQueriesAndSetStore(context, params, result, next) {
  if (params.streams === null) return next();
  try {
    streamsQueryUtils.validateStreamsQueriesAndSetStore(params.streams);
  } catch (e) {
    return next(errors.invalidRequestStructure('Initial filtering: ' + e, params.streams));
  }
  next();
}

// the two tasks are joined as '*' replaced have their permissions checked 
async function streamQueryCheckPermissionsAndReplaceStars(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
  context.tracing.startSpan('streamQueries');
  const unAuthorizedStreams = [];
  const unAccessibleStreams = [];

  async function streamExistsAndCanGetEventsOnStream(streamId, storeId) {
    // remove eventual '#' in streamQuery
    const cleanStreamId = streamId.startsWith('#') ? streamId.substr(1) : streamId;

    const stream = await context.streamForStreamId(cleanStreamId, storeId);
    if (!stream) {
      unAccessibleStreams.push(cleanStreamId);
      return;
    }
    if (! await context.access.canGetEventsOnStream(cleanStreamId, storeId)) {
      unAuthorizedStreams.push(cleanStreamId);
    }
  }

  for (let streamQuery of params.streams) {
    // ------------ "*" case 
    if (streamQuery.any && streamQuery.any.includes('*')) {
      if (await context.access.canGetEventsOnStream('*', streamQuery.storeId)) continue; // We can keep star

      // replace any by allowed streams for reading
      const canRead = [];
      for (const streamPermission of context.access.getStoresPermissions(streamQuery.storeId)) {
        if (await context.access.canGetEventsOnStream(streamPermission.streamId, streamQuery.storeId)) {
          canRead.push(streamPermission.streamId);
        }
      }
      streamQuery.any = canRead;
    } else { // ------------ All other cases
      /**
       * ! we don't have to check for permissions on 'all' or 'not' as long there is at least one 'any' authorized. 
       */
      if (!streamQuery.any || streamQuery.any.length === 0) {
        return next(errors.invalidRequestStructure('streamQueries must have a valid {any: [...]} component'));
      }

      for (let streamId of streamQuery.any) {
        await streamExistsAndCanGetEventsOnStream(streamId, streamQuery.storeId);
      };
    }
  }

  if (unAuthorizedStreams.length > 0) {
    context.tracing.finishSpan('streamQueries');
    return next(errors.forbidden('stream [' + unAuthorizedStreams[0] + '] has not sufficent permission to get events'));
  }
  if (unAccessibleStreams.length > 0) {
    context.tracing.finishSpan('streamQueries');
    return next(errors.unknownReferencedResource(
      'stream' + (unAccessibleStreams.length > 1 ? 's' : ''),
      'streams',
      unAccessibleStreams));
  }
  next();
}

/**
   * Add "forced" and "none" events from permissions
   */
function streamQueryAddForcedAndForbiddenStreams(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
  for (let streamQuery of params.streams) {
    // ------------ ALL --------------- //
    // add forced Streams if exists
    const forcedStreams = context.access.getForcedStreamsGetEventsStreamIds(streamQuery.storeId);

    if (forcedStreams != null && forcedStreams.length > 0) {
      if (streamQuery.all == null) streamQuery.all = [];
      streamQuery.all.push(...forcedStreams);
    }

    // ------------- NOT ------------- //
    const forbiddenStreams = context.access.getForbiddenGetEventsStreamIds(streamQuery.storeId);
    if (forbiddenStreams != null && forbiddenStreams.length > 0) {
      if (streamQuery.not == null) streamQuery.not = [];
      streamQuery.not.push(...forbiddenStreams);
    }
  }
  next();
}

async function streamQueryExpandStreams(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
  async function expandStreamInContext(streamId, storeId, excludedIds) {
    // remove eventual '#' in streamQuery
    if (streamId.startsWith('#')) {
      return [streamId.substr(1)]; // do not expand Stream
    }

    const query =  {
      id: streamId, 
      storeId: storeId, 
      includeTrashed: params.includeTrashed || params.state === 'all', 
      expandChildren: true,
      excludedIds: excludedIds
    };

    // do not expand SystemStreams for non-personal tokens
    if (streamId === '*' && storeId === 'local' && ! context.access.isPersonal()) {
      query.hideSystemStreams = true;
    }

    const tree = await stores.streams.get(context.user.id, query);
    
    // collect streamIds 
    const resultWithPrefix = treeUtils.collectPluck(tree, 'id');
    // remove storePrefix 
    const result = resultWithPrefix.map((fullStreamId) => {
      return StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId)[1];
    });
    return result;
  }

  try {
    params.streams = await streamsQueryUtils.expandAndTransformStreamQueries(params.streams, expandStreamInContext);
  } catch (e) {
    console.log(e);
    context.tracing.finishSpan('streamQueries');
    return next(e);
  }

  // delete streamQueries with no inclusions 
  params.streams = params.streams.filter(streamQuery => streamQuery.any || streamQuery.and);
  context.tracing.finishSpan('streamQueries');
  next();
}

async function applyDefaultsForRetrieval(context, params, result, next) {
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

async function init() {
  stores = await getStores();
}

module.exports = {
  init,
  applyDefaultsForRetrieval,
  coerceStreamsParam,
  validateStreamsQueriesAndSetStore,
  transformArrayOfStringsToStreamsQuery,
  streamQueryCheckPermissionsAndReplaceStars,
  streamQueryAddForcedAndForbiddenStreams,
  streamQueryExpandStreams
}