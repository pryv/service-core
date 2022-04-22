/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { DataStore } = require('pryv-datastore');
const _ = require('lodash');
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
    const [storeId, eventId] = streamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
    const eventForStore = eventsUtils.convertEventToStore(storeId, eventData);

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
        if (streamStoreId != storeId) { throw errorFactory.invalidRequestStructure('events cannot be moved to a different store', eventData); }
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
      return eventsUtils.convertEventFromStore(storeId, eventForStore);
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
          // remove attachments if needed
          if (update.fieldsToDelete.includes('attachments') && eventData.attachments != null) {
            for (let attachment of eventData.attachments) {
              await mallEvents.attachmentDelete(uid, eventData, attachment.id, mallTransaction);
            }
          }

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
    const {store, eventForStore, storeTransaction} = await this._prepareForStore(eventData, mallTransaction);
    try {
      const res = await store.events.create(uid, eventForStore, storeTransaction);
      return eventsUtils.convertEventFromStore(store.id, res);
    } catch (e) {
      this.mall.throwAPIError(e, store.id);
    }
  }

  async createMany(uid, eventsData, mallTransaction) {
    for (let eventData of eventsData) {
      await this.create(uid, eventData, mallTransaction);
    }
  }

  async attachmentsLoad(userId: string, eventDataWithoutAttachments: any, isExistingEvent: boolean, attachmentsItems: Array<AttachmentItem>, mallTransaction?: MallTransaction) {
    const {store, eventForStore, storeTransaction} = await this._prepareForStore(eventDataWithoutAttachments, mallTransaction);
    return await store.events.attachmentsLoad(userId, eventForStore, isExistingEvent, attachmentsItems, storeTransaction);
  }

  async attachmentDelete(userId: string, eventData: any, attachmentId: string, mallTransaction?: MallTransaction) {
    const {store, eventForStore, storeTransaction} = await this._prepareForStore(eventData, mallTransaction);
    return await store.events.attachmentDelete(userId, eventForStore, attachmentId, storeTransaction);
  }

  async createWithAttachments(uid: string, eventDataWithoutAttachments: any, attachmentsItems: Array<AttachmentItem>, mallTransaction?: MallTransaction): Promise<void> {
    const attachmentsResponse = await this.attachmentsLoad(uid, eventDataWithoutAttachments, false, attachmentsItems, mallTransaction);
    const eventDataWithNewAttachments = _attachmentsResponseToEvent(eventDataWithoutAttachments, attachmentsResponse, attachmentsItems);
    return await this.create(uid, eventDataWithNewAttachments, mallTransaction);
  }

  async updateWithAttachments(uid: string, eventDataWithoutNewAttachments: any, newAttachmentsItems: Array<AttachmentItem>, mallTransaction?: MallTransaction): Promise<void> {
    const attachmentsResponse = await this.attachmentsLoad(uid, eventDataWithoutNewAttachments, true, newAttachmentsItems, mallTransaction);
    const eventDataWithNewAttachments = _attachmentsResponseToEvent(eventDataWithoutNewAttachments, attachmentsResponse, newAttachmentsItems);
    return await this.update(uid, eventDataWithNewAttachments, mallTransaction);
  }

  async updateDeleteAttachment(uid: string, eventData: any, attachmentId: string, mallTransaction?: MallTransaction): Promise<void> {
    await this.attachmentDelete(uid, eventData, attachmentId, mallTransaction);
    const newEventData = _.cloneDeep(eventData);
    newEventData.attachments = newEventData.attachments.filter((attachment) => { return attachment.id !== attachmentId });
    return await this.update(uid, newEventData, mallTransaction);
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
      const paramsForStore = eventsGetUtils.getQueryFromParamsForAStore({ id: eventId, state: 'all', limit: 1, includeDeletions: true });
      const events: Array<Events> = await store.events.get(uid, paramsForStore);
      if (events?.length === 1) return eventsUtils.convertEventFromStore(storeId, events[0]);
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
        const paramsForStore = eventsGetUtils.getQueryFromParamsForAStore(params);
        const events = await store.events.get(uid, paramsForStore);
        for (let event of events) {
          res.push(eventsUtils.convertEventFromStore(storeId, event));
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
      const paramsForStore = eventsGetUtils.getQueryFromParamsForAStore(paramsByStore[storeId]);
      const eventsStreamFromDB = await store.events.getStreamed(uid, paramsForStore);
      return eventsStreamFromDB.pipe(new eventsUtils.ConvertEventFromStoreStream(storeId));
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
        const paramsForStore = eventsGetUtils.getQueryFromParamsForAStore(params);
        await store.events.delete(uid, paramsForStore);
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
  async _prepareForStore(eventData, mallTransaction) {
    
    let storeId = null; 
    let dummyId = null; // unused.

    // add eventual missing id and get storeId from first streamId then 
    if (eventData.id == null) {
      [storeId, dummyId] = streamsUtils.storeIdAndStreamIdForStreamId(eventData.streamIds[0]);
      const prefix = (storeId == 'local') ? '' : ':' + storeId + ':';
      eventData.id = prefix + cuid();
    } else { // get storeId from event id 
      [storeId, dummyId] = streamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
    }

    // set integrity
    integrity.events.set(eventData);

    // get an event ready for this store
    const eventForStore = eventsUtils.convertEventToStore(storeId, eventData);

    const store = this.mall._storeForId(storeId);
    const storeTransaction = (mallTransaction == null) ? null : await mallTransaction.forStoreId(storeId);

    return { store, eventForStore, storeTransaction };
  }
}

module.exports = StoreUserEvents;

/**
 * Add attachment response to eventData
 */
function _attachmentsResponseToEvent(eventDataWithoutNewAttachments, attachmentsResponse, attachmentsItems) {
  const eventDataWithNewAttachments = _.cloneDeep(eventDataWithoutNewAttachments);
  eventDataWithNewAttachments.attachments = eventDataWithNewAttachments.attachments || [];
  for (let i = 0; i < attachmentsResponse.length; i++) {
    eventDataWithNewAttachments.attachments.push({
      id: attachmentsResponse[i].id, // ids comes from storage
      fileName: attachmentsItems[i].fileName,
      type: attachmentsItems[i].type,
      size: attachmentsItems[i].size,
      integrity: attachmentsItems[i].integrity,
    });
  }
  return eventDataWithNewAttachments;
}

