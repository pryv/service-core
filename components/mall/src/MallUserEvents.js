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
const StreamsUtils = require('./lib/StreamsUtils');
const EventsGetUtils = require('./lib/EventsGetUtils');

const errorFactory = require('errors').factory;
const integrity = require('business/src/integrity');

const { Readable } = require('stream');

const cuid = require('cuid');

const DELETION_MODES_FIELDS = {
  'keep-authors': [
    'streamIds', 'time',
    'duration', 
    'type', 'content',
    'description',
    'attachments', 'clientData',
    'trashed', 'created',
    'createdBy', 'integrity'
  ],
  'keep-nothing': [
    'streamIds', 'time',
    'duration', 
    'type', 'content',
    'description',
    'attachments', 'clientData',
    'trashed', 'created',
    'createdBy', 'modified',
    'modifiedBy', 'integrity'
  ]
}

const ALL_FIELDS = 
  ['streamIds', 'time', 
  'duration', 
  'type', 'content', 
  'description', 'attachments', 
  'clientData', 'trashed', 
  'created', 'createdBy',
  'modified', 'modifiedBy', 
  'integrity'];

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
  /**
   * 
   * @param {string} uid 
   * @param {Event} originalEvent - Providing the original event to be updated prevent the need to fetch it from the store for integrity calculation
   * @param {any} fieldsToSet - Object with fields to set
   * @param {Array<string>} fieldsToDelete - Array of fields to delete
   * @param {MallTransaction} mallTransaction
   * @returns 
   */
  async updateWithOriginal(uid, originalEvent, fieldsToSet, fieldsToDelete, mallTransaction) {
    const newEventData = _.clone(originalEvent);
    for (const fieldKey of Object.keys(fieldsToSet)) {
      newEventData[fieldKey] = fieldsToSet[fieldKey];
    }
    if (fieldsToDelete != null) {
      for (const fieldKey of fieldsToDelete) {
        delete newEventData[fieldKey];
      }
    }
    return await this.updateReplace(uid, newEventData, mallTransaction);
  }

  async updateReplace(uid, eventData, mallTransaction) {
    const [storeId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
    const eventForStore = _.clone(eventData);


    // update integrity field and recalculate if needed
    // integrity caclulation is done on event.id and streamIds that includes the store prefix
    delete eventForStore.integrity;
    if (integrity.events.isActive) {
      integrity.events.set(eventForStore);
    } 

    // delete Id
    delete eventForStore.id;

    // replace all streamIds by store-less streamIds
    if ((eventForStore?.streamIds)) {
      const newStreamIds = [];
      for (const fullStreamId of eventForStore.streamIds) {
        const [streamStoreId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId);
        if (streamStoreId != storeId) { throw new Error('events cannot be moved to a different store'); }
        newStreamIds.push(streamId);
      }
      eventForStore.streamIds = newStreamIds;
    }


    // build up list of fields to delete 
    const fieldsToDelete = ALL_FIELDS.filter(field => eventForStore[field] === undefined);

    const store = this.mall._storeForId(storeId);
    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);
    try {
      return await store.events.update(uid, eventId, eventForStore, fieldsToDelete, storeTransaction);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  }


  /**
   * 
   * @param {string} uid 
   * @param {string} fullEventId 
   * @param {any} fieldsToSet - Object with fields to set
   * @param {Array<string>} fieldsToDelete - Array of fields to delete
   * @param {MallTransaction} mallTransaction
   * @returns 
   */
  async update(uid, fullEventId, fieldsToSet, fieldsToDelete, mallTransaction) {
    const originalEvent = await this.getOne(uid, fullEventId);
    return await this.updateWithOriginal(uid, originalEvent, fieldsToSet, fieldsToDelete, mallTransaction);
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
   * @param {MallTransaction} mallTransaction
   * @returns Streams of updated events
   */
  async updateStreamedMany(uid, query, update = {}, mallTransaction): Readable {
    const paramsByStore = EventsGetUtils.getParamsByStore(query);

    // fetch events to be updated 
    const streamedMatchingEvents = await this.getStreamedWithParamsByStore(uid, paramsByStore);

    const that = this;
    async function* reader() {
      for await (const event of streamedMatchingEvents) {
        const fieldsToSet = _.merge(event, update.fieldsToSet);
        if (update.addStreams && update.addStreams.length > 0) {
          fieldsToSet.streamIds = _.union(fieldsToSet.streamIds, update.addStreams);
        }
        if (update.removeStreams && update.removeStreams.length > 0) {
          fieldsToSet.streamIds = _.difference(fieldsToSet.streamIds, update.removeStreams);
        }

        // eventually remove fields from event
        if (update.fieldsToDelete && update.fieldsToDelete.length > 0) {
          for (let field of update.fieldsToDelete) {
            delete fieldsToSet[field];
          }
        }

        const updatedEvent = await that.updateWithOriginal(uid, event, fieldsToSet, update.fieldsToDelete, mallTransaction);
        yield updatedEvent;
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
      'duration',
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
    const eventForStore = _.clone(eventData);
    
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

    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);

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
      const events: Array<Events> = await store.events.get(uid, { id: eventId, state: 'all', limit: 1, includeDeletions: true });
      if (events?.length === 1) return events[0];
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
    return null;
  }

  async get(uid, params) {
    return await this.getWithParamsByStore(uid, EventsGetUtils.getParamsByStore(params));
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
    return await this.getStreamedWithParamsByStore(uid, EventsGetUtils.getParamsByStore(params));
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
  async generateStreamsWithParamsByStore(uid, paramsByStore, addEventStreamCB) {
    for (let storeId of Object.keys(paramsByStore)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsByStore[storeId];
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
    const paramsByStore = EventsGetUtils.getParamsByStore(query);
    for (let storeId of Object.keys(paramsByStore)) {
      const store = this.mall._storeForId(storeId);
      const params = paramsByStore[storeId];
      try {
        await store.events.delete(uid, params);
      } catch (e) {
        this.mall.throwAPIError(e, storeId);
      }
    }
  }

}

module.exports = StoreUserEvents;
