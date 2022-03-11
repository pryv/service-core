/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

 const streamsUtils = require('./streamsUtils');
 const _ = require('lodash');
 
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
  let singleStoreId, singleEventId, headId;
  if (query.id != null) { // a specific event is queried so we have a singleStore query;
    [singleStoreId, singleEventId] = streamsUtils.storeIdAndStreamIdForStreamId(query.id);
  }

  if (query.headId != null) { // a specific "head" is queried so we have a singleStore query;
    if (query.id != null) throw new Error('Cannot mix headId and id in query');
    [singleStoreId, headId] = streamsUtils.storeIdAndStreamIdForStreamId(query.headId);
  }

  // repack streamQueries by storeId
  const streamQueriesBySource = {};
  if (query.streams != null) { // must be an array
    for (let streamQuery of query.streams) {
      const storeIdHolder = { id: null};

      const resCleanQuery = cleanSQ(streamQuery, storeIdHolder);
      const storeId = storeIdHolder.id;

      if (singleStoreId != null && singleStoreId != storeId) throw new Error('streams query must be from the same store than the requested event');
      if (streamQueriesBySource[storeId] == null) streamQueriesBySource[storeId] = [];
      streamQueriesBySource[storeId].push(resCleanQuery);
    }
  }

  const paramsByStore = {};
  for (let storeId of Object.keys(streamQueriesBySource)) {
    paramsByStore[storeId] = _.cloneDeep(query);
    paramsByStore[storeId].streams = streamQueriesBySource[storeId];
  }

  if (singleStoreId != null) {
    if (paramsByStore[singleStoreId] == null) paramsByStore[singleStoreId] = _.cloneDeep(query);
    if (headId != null) {
      paramsByStore[singleStoreId].headId = headId;
    } else { // singleEventId != null
      paramsByStore[singleStoreId].id = singleEventId;
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
  for (let key of ['any', 'not']) { // for each possible segment of query
    if (subStreamQuery[key] != null) {
      for (let streamId of subStreamQuery[key]) {
        const [streamStoreId, cleanStreamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamId);
        if (storeIdHolder.id == null) storeIdHolder.id = streamStoreId;
        if (storeIdHolder.id != streamStoreId) throw new Error('streams must be from the same store, per query segemnt');
        cleanStreamQuery[key] = cleanStreamQuery[key] || [];
        cleanStreamQuery[key].push(cleanStreamId);
      }
    }
  }
  if (subStreamQuery.and != null) {
    cleanStreamQuery.and = subStreamQuery.and.map(sq => { return cleanSQ(sq, storeIdHolder); });
  }
  return cleanStreamQuery;
}


module.exports = {
  getParamsByStore,
}