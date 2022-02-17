/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { DataStore } = require('pryv-datastore');
const _ = require('lodash');
const StreamsUtils = require('./lib/StreamsUtils');
const EventsUtils = require('./lib/EventsUtils');
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

const STORE_FIELDS =
  ['streamIds', 'time',
    'endTime', // on stores, duration is replaced by endTime
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
   * Fully Replace the event with the same id with eventData
   * @param {string} uid 
   * @param {Event} eventData 
   * @param {MallTransaction} mallTransaction 
   * @returns 
   */
  async updateReplace(uid, eventData, mallTransaction) {
    const [storeId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.id);

    // update integrity field and recalculate if needed
    // integrity caclulation is done on event.id and streamIds that includes the store prefix
    integrity.events.set(eventData);

    const eventForStore = EventsUtils.convertEventToStore(storeId, eventData);

    // delete Id
    delete eventForStore.id;

    // replace all streamIds by store-less streamIds
    if ((eventForStore?.streamIds)) {
      const newStreamIds = [];
      for (const fullStreamId of eventForStore.streamIds) {
        const [streamStoreId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId);
        if (streamStoreId != storeId) { throw errorFactory.invalidRequestStructure('events cannot be moved to a different store', eventData); }
        newStreamIds.push(streamId);
      }
      eventForStore.streamIds = newStreamIds;
    }


    // build up list of fields to delete 
    const fieldsToDelete = STORE_FIELDS.filter(field => eventForStore[field] === undefined);

    const store = this.mall._storeForId(storeId);
    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);
    try {
      const res = await store.events.update(uid, eventId, eventForStore, fieldsToDelete, storeTransaction);
      $$(res);
      return EventsUtils.convertEventFromStore(storeId, res);
    } catch (e) {
      this.mall.throwAPIError(e, storeId);
    }
  }

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
   * Utility to remove data from event history (versions) used by methods 'events' and 'streams'
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
    const {store, eventForStore, storeTransaction} = await this._prepareForCreate(eventData, mallTransaction);
    try {
      const res = await store.events.create(uid, eventForStore, storeTransaction);
      return EventsUtils.convertEventFromStore(store.id, res);
    } catch (e) {
      this.mall.throwAPIError(e, store.id);
    }
  }

  async createMany(uid, eventsData, mallTransaction) {
    for (let eventData of eventsData) {
      await this.create(uid, eventData, mallTransaction);
    }
  }

  async createWithAttachments(uid: string, eventDataWithoutAttachments: any, attachmentsItems: Array<AttachmentItem>, mallTransaction?: MallTransaction): Promise<void> {
    const {store, eventForStore, storeTransaction} = await this._prepareForCreate(eventDataWithoutAttachments, mallTransaction);
    

    try {
      const res = await store.events.createWithAttachments(uid, eventForStore, attachmentsItems, finalizeEventCallBack, storeTransaction);
      return EventsUtils.convertEventFromStore(store.id, res);
    } catch (e) {
      this.mall.throwAPIError(e, store.id);
    }

    //** This will be called when attachments have been saved on store */
    async function finalizeEventCallBack(attachmentsResponse) {
      const eventWithFullIds = _.cloneDeep(eventDataWithoutAttachments); // needed to compute integrity
      
      eventWithFullIds.attachments = [];
      for (let i = 0; i < attachmentsResponse.length; i++) {
        eventWithFullIds.attachments.push({
          id: attachmentsResponse[i].id, // ids comes from storage
          fileName: attachmentsItems[i].fileName,
          type: attachmentsItems[i].type,
          size: attachmentsItems[i].size,
          integrity: attachmentsItems[i].integrity,
        });
      }
       
      integrity.events.set(eventWithFullIds);

      // Prepare result event 
      const finalEventForStore = EventsUtils.convertEventToStore(store.id, eventWithFullIds);
      return finalEventForStore;
    }


  }

  async attachmentAdd(uid: string, eventDataWithoutNewAttachments: any, newAttachmentsItems: Array<AttachmentItem>, mallTransaction?: MallTransaction): Promise<void> {
    const [storeId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventDataWithoutNewAttachments.id);
    const eventForStore = EventsUtils.convertEventToStore(storeId, eventDataWithoutNewAttachments);
    const store = this.mall._storeForId(storeId);
    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);

    try {
      const res = await store.events.attachmentAdd(uid, eventForStore, newAttachmentsItems, finalizeEventCallBack, storeTransaction);
      return EventsUtils.convertEventFromStore(store.id, res);
    } catch (e) {
      this.mall.throwAPIError(e, store.id);
    }

    //** This will be called when attachments have been saved on store */
    async function finalizeEventCallBack(attachmentsResponse) {
      const eventWithFullIds = _.cloneDeep(eventDataWithoutAttachments); // needed to compute integrity
      
      eventWithFullIds.attachments = eventWithFullIds.attachments || [];
      for (let i = 0; i < attachmentsResponse.length; i++) {
        eventWithFullIds.attachments.push({
          id: attachmentsResponse[i].id, // ids comes from storage
          fileName: attachmentsItems[i].fileName,
          type: attachmentsItems[i].type,
          size: attachmentsItems[i].size,
          integrity: attachmentsItems[i].integrity,
        });
      }
       
      integrity.events.set(eventWithFullIds);

      // Prepare result event 
      const finalEventForStore = EventsUtils.convertEventToStore(store.id, eventWithFullIds);
      return finalEventForStore;
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
      if (events?.length === 1) return EventsUtils.convertEventFromStore(storeId, events[0]);
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
        for (let event of events) {
          res.push(EventsUtils.convertEventFromStore(storeId, event));
        }
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
      const eventsStreamFromDB = await store.events.getStreamed(uid, paramsByStore[storeId]);
      return eventsStreamFromDB.pipe(new EventsUtils.ConvertEventFromStoreStream(storeId));
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

  // --------------------------- ATTACHEMENTS ------------------- //


  // ------------------- UTILS ---------//

  /**
 * Common utils for events.create and events.createWithAttachmentss
 * @param {*} eventData 
 * @param {*} mallTransaction 
 * @returns 
 */
async _prepareForCreate(eventData, mallTransaction) {
  
  let storeId = null; 
  let dummyId = null; // unused.

  // add eventual missing id and get storeId from first streamId then 
  if (eventData.id == null) {
    [storeId, dummyId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.streamIds[0]);
    const prefix = (storeId == 'local') ? '' : ':' + storeId + ':';
    eventData.id = prefix + cuid();
  } else { // get storeId from event id 
    [storeId, dummyId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
  }

  // set integrity
  integrity.events.set(eventData);

  // get an event ready for this store
  const eventForStore = EventsUtils.convertEventToStore(storeId, eventData);

  const store = this.mall._storeForId(storeId);
  const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);

  return { store, eventForStore, storeTransaction };
}
}

module.exports = StoreUserEvents;

