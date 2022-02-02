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

const { Readable } = require('stream');

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

  // --------------------------- UPDATE ----------------- //
  async update(uid, fullEventId, eventData) {
    const [storeId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullEventId);
    const store: DataStore = this.mall._storeForId(storeId);
    if (store == null) return null;
    try {
      return await store.events.update(uid, eventId, eventData);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  }

  /**
   * Utility to change streams for multiple matching events 
   * @param {string} uid - userId
   * @param {*} query - query to find events @see events.get parms
   * @param {*} update - perform replacement of values for matching events
   * @param {Array<string>} addStreamsIds - array of streams to add to the events streamIds
   * @param {Array<string>} removeStreamsIds - array of streams to be remove from the events streamIds
   * @returns Streams of updated events
   */
  async updateMany(uid, query, update = {}, addStreams = [], removeStreams = []) {
    const streamedUpdate = await this.updateStreamedMany(uid, query, update, addStreams, removeStreams);
    const result = [];
    for await (let event of streamedUpdate) {
      result.push(event);
    }
    $$('updateManyDONE', {query, update, addStreams, removeStreams, result});
    return result;
  }

  /**
   * Utility to change streams for multiple matching events 
   * @param {string} uid - userId
   * @param {*} query - query to find events @see events.get parms
   * @param {*} update - perform replacement of values for matching events
   * @param {Array<string>} addStreamsIds - array of streams to add to the events streamIds
   * @param {Array<string>} removeStreamsIds - array of streams to be remove from the events streamIds
   * @returns Streams of updated events
   */
  async updateStreamedMany(uid, query, update = {}, addStreams = [], removeStreams = []) {
    const paramsByStore = getParamsBySource(query);

    // check updates does not move events to a different store
    let singleStoreId = null;
    if (query.id != null) { // event id is provided
      const [eventStoreId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(query.id); 
      singleStoreId = eventStoreId;
    }
    if (update.streamIds != null) { // update streamIds is provided
      for (let fullStreamId of update.streamIds) {
        const [streamStoreId, fullStreamId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId); 
        if (singleStoreId == null) singleStoreId = streamStoreId;
        if (singleStoreId != streamStoreId) throw new Error('events cannot be moved to a different store');
      }
    }
    if (addStreams.length > 0) { // add streamIds is provided
      for (let fullStreamId of addStreams) {
        const [streamStoreId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId); 
        if (singleStoreId == null) singleStoreId = streamStoreId;
        if (singleStoreId != streamStoreId) throw new Error('events cannot be moved to a different store');
      }
    }
    // if we are in a single store mode check that the query matches
    if (singleStoreId != null) { 
      for (let storeId of Object.keys(paramsByStore)) {
        if (storeId !== singleStoreId) {
          throw new Error('events cannot be moved to a different store');
        }
      }
    }
    // fetch events to be updated 
    const streamedMatchingEvents = await this.getStreamedWithParamsByStore(uid, paramsByStore);

    const that = this;
    async function* reader() {
      for await (const event of streamedMatchingEvents) {
        const eventToUpdate = _.merge(event, update);
        if (addStreams.length > 0) {
          eventToUpdate.streamIds = eventToUpdate.streamIds.concat(addStreams);
        }
        if (removeStreams.length > 0) {
          eventToUpdate.streamIds = _.difference(eventToUpdate.streamIds, removeStreams);
        }
        const eventId = eventToUpdate.id;
        delete eventToUpdate.id;
        const updatedEvent = await that.update(uid, eventId, eventToUpdate);
        yield updatedEvent;
      }
    
      // finish the iterator
      return true;
    }


    return Readable.from(reader());
  }

  // --------------------------- CREATE ----------------- //

  /**
   * 
   * @param {*} uid 
   * @param {*} eventData 
   */
  async create(uid, eventData, mallTransaction) {
    const eventForStore = _.clone(eventData);
    let storeId;

    // if eventId is provided make sure it's compatible with the storeId & clean it
    if (eventData.id) {
      const [testStoreId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
      storeId = testStoreId;
      eventForStore.id = eventId;
    }
    
    // cleanup storeId from streamId
    if (eventData.streamIds != null) { // it might happen that deleted is set but streamIds is not when loading test data
      for (let i = 0; i < eventData.streamIds.length; i++) {
        // check that the event belongs to a single store.
        const [testStoreId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.streamIds[i]);
        if (storeId == null) { storeId = testStoreId; }
        else if (testStoreId !== storeId) {
          throw errorFactory.invalidRequestStructure('Cannot create event with multiple streams belonging to different stores', eventData);
        }
        eventForStore.streamIds[i] = streamId;
      }
    }
    if (storeId == null) {
      throw errorFactory.invalidRequestStructure('Cannot find store information in new event', eventData);
    }
    
    const store = this.mall._storeForId(storeId);

    let storeTransaction = null;
    if (mallTransaction != null) {
      storeTransaction = await mallTransaction.forStoreId(storeId);
    }

    try {
      return await store.events.create(uid, eventForStore, storeTransaction);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  }

  async createMany(uid, eventsData, mallTransaction) {
    for (let eventData of eventsData) {
      await this.create(uid, eventData, mallTransaction);
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