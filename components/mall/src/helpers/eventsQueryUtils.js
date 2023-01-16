/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const storeDataUtils = require('./storeDataUtils');
const _ = require('lodash');

module.exports = {
  getParamsByStore,
  getStoreQueryFromParams
};

const DELTA_TO_CONSIDER_IS_NOW = 5; // 5 seconds

/**
 * A generic query for events.get, events.updateMany, events.delete
 * @typedef {Object} EventsGetQuery
 * @property {string} [id] - an event id 
 * @property {Array<StreamQuery>} [streams] - an array of stream queries (see StreamQuery)
 * @property {('trashed'|'all'|null)} [state=null] - get only trashed, all document or non-trashed events (default is non-trashed)
 * @property {Array<EventType>} [types] - reduce scope of events to a set of types
 * @property {timestamp} [fromTime] - events with a time of endTime after this timestamp
 * @property {timestamp} [toTime] - events with a time of endTime before this timestamp
 * @property {timestamp} [modifiedSince] - events modified after this timestamp
 * @property {boolean} [running] - events with an EndTime "null"
 */

/**
 * Get per-store query params from the given API query params.
 * @param {EventsGetQuery} params - a query object
 * @returns {Object.<String, EventsGetQuery>}
 * @throws {Error} if params.headId is set
 * @throws {Error} if query.id is set and params.streams is querying a different store
 * @throws {Error} if query.streams contains stream queries that implies different stores
 */
function getParamsByStore (params) {
  let singleStoreId, singleStoreEventId;
  if (params.id) { // a specific event is queried so we have a singleStore query;
    [singleStoreId, singleStoreEventId] = storeDataUtils.parseStoreIdAndStoreItemId(params.id);
  }

  if (params.headId) { // a specific "head" is queried so we have a singleStore query;
    throw new Error('Cannot use headId and id in query');
  }

  // repack stream queries by store
  const streamQueriesByStore = {};
  if (params.streams) { // must be an array
    for (const streamQuery of params.streams) {
      const context = { storeId: null };

      const resCleanQuery = getStoreStreamQuery(streamQuery, context);
      const storeId = context.storeId;

      if (singleStoreId && singleStoreId !== storeId) throw new Error('streams query must be from the same store than the requested event');
      streamQueriesByStore[storeId] ??= [];
      streamQueriesByStore[storeId].push(resCleanQuery);
    }
  }

  const paramsByStore = {};
  for (const storeId of Object.keys(streamQueriesByStore)) {
    paramsByStore[storeId] = _.cloneDeep(params);
    paramsByStore[storeId].streams = streamQueriesByStore[storeId];
  }

  if (singleStoreId) {
    paramsByStore[singleStoreId] ??= _.cloneDeep(params);
    paramsByStore[singleStoreId].id = singleStoreEventId;
  }

  if (Object.keys(paramsByStore).length === 0) { // default is local
    paramsByStore.local = _.cloneDeep(params);
    delete paramsByStore.local.streams;
  }

  return paramsByStore;
}

function getStoreStreamQuery (streamQuery, context) {
  const storeStreamQuery = {};
  for (const operator of ['any', 'not']) { // for each possible segment of query
    if (streamQuery[operator]) {
      for (const streamId of streamQuery[operator]) {
        const [storeId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
        context.storeId ??= storeId;
        if (context.storeId !== storeId) throw new Error('Streams within a query must belong to the same store');
        storeStreamQuery[operator] ??= [];
        storeStreamQuery[operator].push(storeStreamId);
      }
    }
  }
  if (streamQuery.and) {
    storeStreamQuery.and = streamQuery.and.map(sq => { return getStoreStreamQuery(sq, context); });
  }
  return storeStreamQuery;
}

/**
 * Translates API query params to the store query format.
 * To be called on store-level params just before querying the store.
 * @param {object} params
 * @returns {object}
 */
function getStoreQueryFromParams (params) {
  const options = {
    sort: { time: params.sortAscending ? 1 : -1 },
    skip: params.skip,
    limit: params.limit
  };

  const query = [];

  // always exclude history data
  query.push({ type: 'equal', content: { field: 'headId', value: null } });
  if (params.headId) {
    throw new Error('No headId in query');
  }

  // trashed
  switch (params.state) {
    case 'trashed':
      query.push({ type: 'equal', content: { field: 'trashed', value: true } });
      break;
    case 'all':
      break;
    default:
      query.push({ type: 'equal', content: { field: 'trashed', value: false } });
  }

  // if getOne
  if (params.id) {
    query.push({ type: 'equal', content: { field: 'id', value: params.id } });
  }

  // all deletions (tests only)
  if (!params.withDeletions) {
    query.push({ type: 'equal', content: { field: 'deleted', value: null } }); // <<== actual default value
  }

  // modified since
  if (params.modifiedSince != null) {
    query.push({ type: 'greater', content: { field: 'modified', value: params.modifiedSince } });
  }

  // types
  if (params.types && params.types.length > 0) {
    query.push({ type: 'typesList', content: params.types });
  }

  // if streams are defined
  if (params.streams && params.streams.length !== 0) {
    query.push({ type: 'streamsQuery', content: params.streams });
  }

  // -------------- time selection -------------- //
  if (params.toTime != null) {
    query.push({ type: 'lowerOrEqual', content: { field: 'time', value: params.toTime } });
  }

  // running
  if (params.running) {
    query.push({ type: 'equal', content: { field: 'endTime', value: null } });
  } else if (params.fromTime != null) {
    const now = Date.now() / 1000 - DELTA_TO_CONSIDER_IS_NOW;
    if (params.fromTime <= now && (params.toTime == null || params.toTime >= now)) { // timeFrame includes now
      query.push({ type: 'greaterOrEqualOrNull', content: { field: 'endTime', value: params.fromTime } });
    } else {
      query.push({ type: 'greaterOrEqual', content: { field: 'endTime', value: params.fromTime } });
    }
  }

  const res = {
    options,
    query
  };

  return res;
}
