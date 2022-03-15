/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { DataStore } = require('pryv-datastore');
const _ = require('lodash');
const AddStorePrefixOnEventsStream = require('./lib/AddStorePrefixOnEventsStream');
const streamsUtils = require('./lib/streamsUtils');
const eventsUtils = require('./lib/eventsUtils');
const eventsGetUtils = require('./lib/eventsGetUtils');

const errorFactory = require('errors').factory;
const integrity = require('business/src/integrity');

const { Readable } = require('stream');

const cuid = require('cuid');

const DELETION_MODES_FIELDS = {
  'keep-authors': [
    'streamIds', 'time',
    'endTime', 
    'type', 'content',
    'description',
    'attachments', 'clientData',
    'trashed', 'created',
    'createdBy', 'integrity'
  ],
  'keep-nothing': [
    'streamIds', 'time',
    'endTime', 
    'type', 'content',
    'description',
    'attachments', 'clientData',
    'trashed', 'created',
    'createdBy', 'modified',
    'modifiedBy', 'integrity'
  ]
}

/**
 * Handle Store.events.* methods
 */
class StoreUserEvents {

  /**
   * @param {Mall} mall 
   */
  constructor(mall: Mall) {
    this.mall = mall;
  }

  // --------------------------- UPDATE ----------------- //

  async update(uid, eventData, mallTransaction) {
    const eventForStore = eventsUtils.convertEventToStore(eventData);
    
    const [storeId, eventId] = streamsUtils.storeIdAndStreamIdForStreamId(eventForStore.id);

    // update integrity field and recalculate if needed
    // integrity caclulation is done on event.id and streamIds that includes the store prefix
    delete eventForStore.integrity;
    if (integrity.events.isActive) {
      integrity.events.set(eventForStore);
    }

    // replace all streamIds by store-less streamIds
    if ((eventForStore?.streamIds)) {
      const newStreamIds = [];
      for (const fullStreamId of eventForStore.streamIds) {
        const [streamStoreId, streamId] = streamsUtils.storeIdAndStreamIdForStreamId(fullStreamId);
        if (streamStoreId != storeId) { throw new Error('events cannot be moved to a different store'); }
        newStreamIds.push(streamId);
      }
      eventForStore.streamIds = newStreamIds;
    }

    const store = this.mall._storeForId(storeId);
    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);
    try {
      const success = await store.events.update(uid, eventForStore, storeTransaction);
      if (! success) {
        throw errorFactory.invalidItemId('Coulnd not update event with id ' + eventData.id);
      }

      return eventsUtils.convertEventFromStore(eventForStore);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  }

  /**
   * Utility to change streams for multiple matching events 
   * @param {string} uid - userId
   * @param {*} query - query to find events @see events.get parms
   * @param {any} update - perform update as per the following
   * @param {any} update.fieldsToSet - provided object fields with matching events
   * @param {Array<string>} update.fieldsToDelete - remove fields from matching events
   * @param {Array<string>} update.addStreams - array of streams ids to add to the events streamIds
   * @param {Array<string>} update.removeStreams - array of streams ids to be remove from the events streamIds
   * @param {Function} update.filter - function to filter events to update (return true to update)
   * @param {MallTransaction} mallTransaction
   * @returns Array of updated events
   */
  async updateMany(uid, query, update, mallTransaction): Array {
    const streamedUpdate = await this.updateStreamedMany(uid, query, update, mallTransaction);
    const result = [];
    for await (let event of streamedUpdate) {
      result.push(event);
    }
    return result;
  }

  /**
   * Utility to change streams for multiple matching events 
   * @param {string} uid - userId
   * @param {*} query - query to find events @see events.get parms
   * @param {any} update - perform update as per the following
   * @param {any} update.fieldsToSet - provided object fields with matching events
   * @param {Array<string>} update.fieldsToDelete - remove fields from matching events
   * @param {Array<string>} update.addStreams - array of streams ids to add to the events streamIds
   * @param {Array<string>} update.removeStreams - array of streams ids to be remove from the events streamIds
   * @param {Function} update.filter - function to filter events to update (return true to update)
   * @param {MallTransaction} mallTransaction
   * @returns Streams of updated events
   */
  async updateStreamedMany(uid, query, update = {}, mallTransaction): Readable {
    const paramsByStore = eventsGetUtils.getParamsByStore(query);

    // fetch events to be updated 
    const streamedMatchingEvents = await this.getStreamedWithParamsByStore(uid, paramsByStore);

    const mallEvents = this;
    async function* reader() {
      for await (const eventData of streamedMatchingEvents) {
        const newEventData = _.merge(eventData, update.fieldsToSet);
        if (update.addStreams && update.addStreams.length > 0) {
          newEventData.streamIds = _.union(newEventData.streamIds, update.addStreams);
        }
        if (update.removeStreams && update.removeStreams.length > 0) {
          newEventData.streamIds = _.difference(newEventData.streamIds, update.removeStreams);
        }

        // eventually remove fields from event
        if (update.fieldsToDelete && update.fieldsToDelete.length > 0) {
          for (let field of update.fieldsToDelete) {
            delete newEventData[field];
          }
        }
        if (update.filter == null || update.filter(newEventData)) {
          const updatedEvent = await mallEvents.update(uid, newEventData, mallTransaction);
          yield updatedEvent;
        }
      }

      // finish the iterator
      return true;
    }

    return Readable.from(reader());
  }

  /**
   * Utility to remove data from event history (versions)
   * @param {*} uid 
   * @param {*} eventId 
   */
  async updateMinimizeEventHistory(uid, eventId) {
    const fieldsToDelete = [
      'streamIds', 'time',
      'endTime',
      'type', 'content',
      'tags', 'description',
      'attachments', 'clientData',
      'trashed', 'created',
      'createdBy', 'integrity'
    ];
    const res = await this.updateMany(uid, { headId: eventId, state: 'all', includeDeletions: true }, { fieldsToDelete });
    return res;
  };


  // --------------------------- CREATE ----------------- //

  /**
   * 
   * @param {*} uid 
   * @param {*} eventData 
   */
  async create(uid, eventData, mallTransaction) {
    const eventForStore =  eventsUtils.convertEventToStore(eventData);

   
    // add id if needed
    eventForStore.id = eventForStore.id || cuid();

    // update integrity field and recalculate if needed
    // integrity caclulation is done on event.id and streamIds that includes the store prefix
    delete eventForStore.integrity;
    if (integrity.events.isActive) {
      integrity.events.set(eventForStore);
    }

    let storeId;
    // if eventId is provided make sure it's compatible with the storeId & clean it
    if (eventData.id) {
      const [testStoreId, eventId] = streamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
      storeId = testStoreId;
      eventForStore.id = eventId;
    }

    // cleanup storeId from streamId
    if (eventData.streamIds != null) { // it might happen that deleted is set but streamIds is not when loading test data
      for (let i = 0; i < eventData.streamIds.length; i++) {
        // check that the event belongs to a single store.
        const [testStoreId, streamId] = streamsUtils.storeIdAndStreamIdForStreamId(eventData.streamIds[i]);
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

    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);

    try {
      const res = await store.events.create(uid, eventForStore, storeTransaction);
      return eventsUtils.convertEventFromStore(res);
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
    const [storeId, eventId] = streamsUtils.storeIdAndStreamIdForStreamId(fullEventId);
    const store: DataStore = this.mall._storeForId(storeId);
    if (store == null) return null;
    try {
      const paramsForStore = prepareParamsForStore({ id: eventId, state: 'all', limit: 1, includeDeletions: true });
      const events: Array<Events> = await store.events.get(uid, paramsForStore);
      if (events?.length === 1) return eventsUtils.convertEventFromStore(events[0]);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
    return null;
  }

  async get(uid, params) {
    return await this.getWithParamsByStore(uid, eventsGetUtils.getParamsByStore(params));
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
        const paramsForStore = prepareParamsForStore(params);
        const events = await store.events.get(uid, paramsForStore);
        for (let event of events) {
          res.push(eventsUtils.convertEventFromStore(event));
        }
      } catch (e) {
        this.mall.throwAPIError(e, storeId);
      }
    }
    return res;
  };

  async getStreamed(uid, params) {
    return await this.getStreamedWithParamsByStore(uid, eventsGetUtils.getParamsByStore(params));
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
      const paramsForStore = prepareParamsForStore(paramsByStore[storeId]);
      const eventsStreamFromDB = await store.events.getStreamed(uid, paramsForStore);
      const eventsStream = eventsStreamFromDB.pipe(new eventsUtils.ConvertEventFromStoreStream());
      if (storeId == 'local') {
        return eventsStream;
      } else {
        return eventsStream.pipe(new AddStorePrefixOnEventsStream(storeId));
      }
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  };

  /**
   * To create a streamed result from multiple stores. 'events.get' pass a callback in order to add the streams 
   * To the result; 
   */
  async generateStreamsWithParamsByStore(uid, paramsByStore, addEventStreamCB) {
    for (let storeId of Object.keys(paramsByStore)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsByStore[storeId];
      try {
        addEventStreamCB(store, await this.getStreamedWithParamsByStore(uid, { [storeId]: params }));
      } catch (e) {
        this.mall.throwAPIError(e, storeId);
      }
    }
  }

  // --------------------------- DELETE / UPDATE ------------------- //

  /**
   * Utility to remove data from event history (versions)
   * @param {*} uid
   * @param {string} deletionMode one of 'keep-nothing', 'keep-authors'
   * @param {any} query get query
   * @param {MallTransaction} mallTransaction
   * @returns {Promise<Array<Events>>}
   **/
  async updateDeleteByMode(uid, deletionMode, query, mallTransaction) {
    const fieldsToSet = { deleted: Date.now() / 1000 };
    const fieldsToDelete = DELETION_MODES_FIELDS[deletionMode] || ['integrity'];

    const res = await this.updateMany(uid, query, { fieldsToSet, fieldsToDelete }, mallTransaction);
  }

  // --------------------------- DELETE ----------------------- //
  async delete(uid, query) {
    const paramsByStore = eventsGetUtils.getParamsByStore(query);
    for (let storeId of Object.keys(paramsByStore)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsByStore[storeId];
      try {
        const paramsForStore = prepareParamsForStore(params);
        await store.events.delete(uid, paramsForStore);
      } catch (e) {
        this.mall.throwAPIError(e, storeId);
      }
    }
  }

}

module.exports = StoreUserEvents;

function prepareParamsForStore(params) {
  const options = {
    sort: { time: params.sortAscending ? 1 : -1 },
    skip: params.skip,
    limit: params.limit
  };

  const query = {
    equals: {},
    greaterThan: {},
  }

  // [{ time: {$gt : 0}, time: {$lt : 2}], 
  // [{$and: [{time: {$gt : 0}, head: 2}, {time: {$lt : 2}}]}]
  //  (TIME > 0 AND HEAD > 2) AND TIME < 2

  // trashed
  switch (params.state) {
    case 'trashed':
      query.equals.trashed = true;
      break;
    case 'all':
      break;
    default:
      query.equals.trashed = false;
  }

  // if getOne
  if (params.id != null) {
    query.equals.id = params.id;
  }

  // all deletions (tests only)
  if (!params.includeDeletions) {
    query.equals.deleted = null;
  }

  // onlyDeletions
  if (params.deletedSince != null) {
    query.greaterThan.deleted = params.deletedSince;
    options.sort = { deleted: -1 };
  }

  // mondified since
  if (params.modifiedSince != null) {
    query.greaterThan.modified = params.modifiedSince;
  }
  
   // history
  if (! params.includeHistory) { // no history;
    query.equals.headId = null;
  }
  if (params.headId) { // I don't like this !! history implementation should not be exposed .. but it's a quick fix for now
    query.equals.headId = params.headId;
    options.sort.modified = 1; // also sort by modified time when history is requested
  } 

  const res = {
    todo : params,
    options,
    query
  }

  return res;
}