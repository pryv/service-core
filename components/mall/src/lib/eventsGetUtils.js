/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

 const streamsUtils = require('./streamsUtils');
 const _ = require('lodash');

 const DELTA_TO_CONSIDER_IS_NOW = 5; // 5 seconds

/**
 * A generic query for events.get, events.updateMany, events.delete
 * @typedef {Object} EventsGetQuery
 * @property {string} [id] - an event id (inconpatible with headId)
 * @property {string} [headId] - for history querying the id of the event to get the history from (incopatible with id))
 * @property {Array<StreamQuery>} [streams] - an array of stream queries (see StreamQuery)
 * @property {('trashed'|'all'|null)} [state=null] - get only trashed, all document or non-trashed events (default is non-trashed)
 * @property {boolean} [includeDeletions=false] - also returns deleted events (default is false) !! used by tests only !!
 * @property {timestamp} [deletedSince] - return deleted events since this timestamp
 * @property {boolean} [includeHistory] - if true, returns the history of the event and the event if "id" is given - Otherwise all events, including their history (use by tests only)
 * @property {Array<EventType>} [types] - reduce scope of events to a set of types
 * @property {timestamp} [fromTime] - events with a time of endTime after this timestamp
 * @property {timestamp} [toTime] - events with a time of endTime before this timestamp
 * @property {timestamp} [modifiedSince] - events modified after this timestamp
 * @property {boolean} [running] - events with an EndTime "null"
 */

/**
 * A Map of EventsQuery by storeId
 * @typedef {Object.<String, EventsGetQuery>} EventsGetQueryByStore
 */

/**
 * Take a generic event Query and repack the query for each store it concerns
 * @param {EventsGetQuery} query - a query object
 * @returns {EventsGetQueryByStore}
 * @throws {Error} if query.id and params.headId are both set
 * @throws {Error} if query.id is set and params.streams is querying a different store
 * @throws {Error} if query.streams contains stream queries that implies different stores
 */
function getParamsByStore(query) {
  let singleStoreId, singleStoreEventId, storeHeadId;
  if (query.id != null) { // a specific event is queried so we have a singleStore query;
    [singleStoreId, singleStoreEventId] = streamsUtils.parseStoreIdAndStoreItemId(query.id);
  }

  if (query.headId != null) { // a specific "head" is queried so we have a singleStore query;
    if (query.id != null) throw new Error('Cannot mix headId and id in query');
    [singleStoreId, storeHeadId] = streamsUtils.parseStoreIdAndStoreItemId(query.headId);
  }

  // repack streamQueries by storeId
  const streamQueriesBySource = {};
  if (query.streams != null) { // must be an array
    for (const streamQuery of query.streams) {
      const storeIdHolder = { id: null };

      const resCleanQuery = cleanSQ(streamQuery, storeIdHolder);
      const storeId = storeIdHolder.id;

      if (singleStoreId != null && singleStoreId !== storeId) throw new Error('streams query must be from the same store than the requested event');
      if (streamQueriesBySource[storeId] == null) streamQueriesBySource[storeId] = [];
      streamQueriesBySource[storeId].push(resCleanQuery);
    }
  }

  const paramsByStore = {};
  for (const storeId of Object.keys(streamQueriesBySource)) {
    paramsByStore[storeId] = _.cloneDeep(query);
    paramsByStore[storeId].streams = streamQueriesBySource[storeId];
  }

  if (singleStoreId != null) {
    if (paramsByStore[singleStoreId] == null) paramsByStore[singleStoreId] = _.cloneDeep(query);
    if (storeHeadId != null) {
      paramsByStore[singleStoreId].headId = storeHeadId;
    } else { // singleEventId != null
      paramsByStore[singleStoreId].id = singleStoreEventId;
    }
  }

  if (Object.keys(paramsByStore).length === 0) { // default is local
    paramsByStore.local = _.cloneDeep(query);
    delete paramsByStore.local.streams;
  }
  return paramsByStore;
}

function cleanSQ(subStreamQuery, storeIdHolder) {
  const cleanStreamQuery = {};
  for (const key of ['any', 'not']) { // for each possible segment of query
    if (subStreamQuery[key] != null) {
      for (const streamId of subStreamQuery[key]) {
        const [storeId, storeStreamId] = streamsUtils.parseStoreIdAndStoreItemId(streamId);
        if (storeIdHolder.id == null) storeIdHolder.id = storeId;
        if (storeIdHolder.id !== storeId) throw new Error('streams must be from the same store, per query segment');
        cleanStreamQuery[key] = cleanStreamQuery[key] || [];
        cleanStreamQuery[key].push(storeStreamId);
      }
    }
  }
  if (subStreamQuery.and != null) {
    cleanStreamQuery.and = subStreamQuery.and.map(sq => { return cleanSQ(sq, storeIdHolder); });
  }
  return cleanStreamQuery;
}

/**
 * Call at last before performing a query to a store.
 * Transform an API params query to a store specific query
 * @param {*} params
 * @returns
 */
function getQueryFromParamsForAStore(params) {
  const options = {
    sort: { time: params.sortAscending ? 1 : -1 },
    skip: params.skip,
    limit: params.limit
  };

  const query = [];


  // trashed
  switch (params.state) {
    case 'trashed':
      query.push({type: 'equal', content: {field: 'trashed', value: true}});
      break;
    case 'all':
      break;
    default:
      query.push({type: 'equal', content:{ field: 'trashed', value: false}});
  }

  // if getOne
  if (params.id != null) {
    query.push({type: 'equal', content:{ field: 'id', value: params.id}});
  }

  if (params.deletedSince != null) {
    query.push({type: 'greater', content:{ field: 'deleted', value: params.deletedSince}});
    options.sort = { deleted: -1 };
  } else {
    // all deletions (tests only)
    if (!params.includeDeletions) {
      query.push({type: 'equal', content:{field: 'deleted', value: null}}); // <<== actual default value
    }
  }

  // mondified since
  if (params.modifiedSince != null) {
    query.push({type: 'greater', content:{ field: 'modified', value: params.modifiedSince}});
  }

  // types
  if (params.types && params.types.length > 0) {
    query.push({type: 'typesList', content: params.types});
  }

   // history
   if (params.headId) { // I don't like this !! history implementation should not be exposed .. but it's a quick fix for now
    query.push({type: 'equal', content: {field: 'headId', value: params.headId}});
    options.sort.modified = 1; // also sort by modified time when history is requested
  } else if (! params.includeHistory) { // no history;
    query.push({type: 'equal', content: {field: 'headId', value: null}});
  }

  // if streams are defined
  if (params.streams != null && params.streams.length != 0) {
    query.push({type: 'streamsQuery', content: params.streams});
  }


  // -------------- time selection -------------- //
  if (params.toTime != null) {
    query.push({type: 'lowerOrEqual', content: { field: 'time', value: params.toTime }});
  }


  // running
  if (params.running) {
    query.push({type: 'equal', content: {field: 'endTime', value: null}});
  } else if (params.fromTime != null) {
    const now = Date.now() / 1000 - DELTA_TO_CONSIDER_IS_NOW;
    if (params.fromTime <= now && ( params.toTime == null || params.toTime >= now)) { // timeFrame includes now
      query.push({type: 'greaterOrEqualOrNull', content: { field: 'endTime', value: params.fromTime }});

    } else {
      query.push({type: 'greaterOrEqual', content: {field: 'endTime', value: params.fromTime}});
    }
  }

  const res = {
    options,
    query
  }

  return res;
}


module.exports = {
  getParamsByStore,
  getQueryFromParamsForAStore,
}
