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

const errorFactory = require('errors').factory;

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

  // --------------------------- CREATE ----------------- //

  /**
   * 
   * @param {*} uid 
   * @param {*} eventData 
   */
  async create(uid, eventData) {
    const eventForStore = _.clone(eventData);
    let storeId;
    // cleanup storeId from streamId
    for (let i = 0; i < eventData.streamIds.length; i++) {
      // check that the event belongs to a single store.
      const [testStoreId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.streamIds[i]);
      if (storeId == null) { storeId = testStoreId; }
      else if (testStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('Cannot create event with multiple streams belonging to different stores', eventData);
      }
      eventForStore.streamIds[i] = streamId;
    }
    // if eventId is provided make sure it's compatible with the storeId & clean it
    if (eventData.id) {
      const [testStoreId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
      if (testStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('Event id should match the store of streamIds', eventData);
      }
      eventForStore.id = eventId;
    }
    const store = this.mall._storeForId(storeId);
    try {
      return await store.events.create(uid, eventForStore);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  }


  // --------------------------- GET ------------------- //

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
    try {
      const events: Array<Events> = await store.events.get(uid, { id: eventId, state: 'all' , limit: 1, includeDeletions: true});
      if (events?.length === 1) return events[0];
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
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
      try {
        const events = await store.events.get(uid, params);
        res.push(...events);
      } catch (e) {
        this.mall.throwAPIError(e, storeId);
      }
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
    try {
      return await store.events.getStreamed(uid, paramsByStore[storeId]);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  };

  /**
   * To create a streamed result from multiple stores. 'events.get' pass a callback in order to add the streams 
   * To the result; 
   */
  async generateStreamsWithParamsByStore(uid, paramsBySource, addEventStreamCB) {
    for (let storeId of Object.keys(paramsBySource)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsBySource[storeId];
      try {
        await store.events.getStreamed(uid, params).then((eventsStream) => {
          if (storeId == 'local') {
            addEventStreamCB(store, eventsStream);
          } else {
            addEventStreamCB(store, eventsStream.pipe(new AddStorePrefixOnEventsStream(storeId)));
          }
        });
      } catch (e) {
        this.mall.throwAPIError(e, storeId);
      }
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