/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { DataStore }  = require('pryv-datastore');
const _ = require('lodash');
const AddStorePrefixOnEventsStream = require('./lib/AddStorePrefixOnEventsStream');
const StreamsUtils = require('./lib/StreamsUtils');

/**
 * Handle Store.events.* methods
 */
class StoreUserEvents  {
  
  /**
   * @param {Mall} mall 
   */
  constructor(mall) {
    this.mall = mall;
  }

  /**
   * Specific to Mall, allow query of a single event
   * @param {*} uid 
   * @param {*} fullEventId 
   * @returns 
   */
  async getOne(uid, fullEventId) {
    const [storeId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullEventId);
    const store: DataStore = this.mall._storeForId(storeId);
    if (store == null) return null;
    const events: Array<Events> = await store.events.get(uid, { id: eventId, state: 'all' , limit: 1, includeDeletions: true});
    if (events?.length === 1) return events[0];
    return null;
  }

  async get(uid, params) {
    return await this.getWithParamsByStore(uid, getParamsBySource(params));
  }

  /**
   * Specific to Mall, allow query with a prepared query by store 
   */
  async getWithParamsByStore(uid, paramsByStore) {
    const res = [];
    for (let storeId of Object.keys(paramsByStore)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsByStore[storeId];
      const events = await store.events.get(uid, params);
      res.push(...events);
    }
    return res;
  };

  async getStreamed(uid, params) {
    return await this.getStreamedWithParamsByStore(uid, getParamsBySource(params));
  }

  /**
   * Specific to Mall, allow query with a prepared query by store 
   */
  async getStreamedWithParamsByStore(uid, paramsByStore) {
    const res = [];
    if (Object.keys(paramsByStore).length != 1) {
      return new Error('getStreamed only supported for one store at a time');
    }
    const storeId = Object.keys(paramsByStore)[0];
    const store = this.mall._storeForId(storeId);
    return await store.events.getStreamed(uid, paramsByStore[storeId]);
  };

  /**
   * To create a streamed result from multiple stores. 'events.get' pass a callback in order to add the streams 
   * To the result; 
   */
  async generateStreamsWithParamsByStore(uid, paramsBySource, addEventStreamCB) {
    for (let storeId of Object.keys(paramsBySource)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsBySource[storeId];
      await store.events.getStreamed(uid, params).then((eventsStream) => {
        if (storeId == 'local') {
          addEventStreamCB(store, eventsStream);
        } else {
          addEventStreamCB(store, eventsStream.pipe(new AddStorePrefixOnEventsStream(storeId)));
        }
      });
    }
  }

}

module.exports = StoreUserEvents;


function getParamsBySource(params) {
  let singleStoreId, singleEventId;
    if (params.id != null) { // a specific event is queried so we have a singleStore query;
      [singleStoreId, singleEventId] = StreamsUtils.storeIdAndStreamIdForStreamId(params.id);
    }

    // repack streamQueries by storeId
    const streamQueriesBySource = {};
    if (params.streams != null) { // must be an array
      for (let streamQuery of params.streams) {
        let storeId = null;
        
        function clean(subStreamQuery) {
          const cleanStreamQuery = {};
          for (let key of ['any', 'not']) { // for each possible segment of query
            if (subStreamQuery[key] != null) {
              for (let streamId of subStreamQuery[key]) {
                const [streamStoreId, cleanStreamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId);
                if (storeId == null) storeId = streamStoreId;
                if (storeId != streamStoreId) throw new Error('streams must be from the same store, per query segemnt');
                cleanStreamQuery[key] = cleanStreamQuery[key] || [];
                cleanStreamQuery[key].push(cleanStreamId);
              }
            }
          }
          if (subStreamQuery.and != null) {
            cleanStreamQuery.and = subStreamQuery.and.map(clean);
          }
          return cleanStreamQuery;
        }
        const resCleanQuery = clean(streamQuery);

        if (singleStoreId != null && singleStoreId != storeId) throw new Error('streams query must be from the same store than the requested event');
        if (streamQueriesBySource[storeId] == null) streamQueriesBySource[storeId] = [];
        streamQueriesBySource[storeId].push(resCleanQuery);
      }
    }
      
    const paramsBySource = {};
    for (let storeId of Object.keys(streamQueriesBySource)) {
      paramsBySource[storeId] = _.cloneDeep(params);
      paramsBySource[storeId].streams = streamQueriesBySource[storeId];
    }

    if (singleStoreId != null) {
      if (paramsBySource[singleStoreId] == null) paramsBySource[singleStoreId] = _.cloneDeep(params);
      paramsBySource[singleStoreId].id = singleEventId;
    }
    
    if (Object.keys(paramsBySource).length === 0) { // default is local
      paramsBySource.local = _.cloneDeep(params);
      delete paramsBySource.local.streams;
    }
    return paramsBySource;
}