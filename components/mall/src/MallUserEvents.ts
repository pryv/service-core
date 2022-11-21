/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { DataStore } = require('pryv-datastore');
const _ = require('lodash');
const storeDataUtils = require('./helpers/storeDataUtils');
const eventsUtils = require('./helpers/eventsUtils');
const eventsQueryUtils = require('./helpers/eventsQueryUtils');

const errorFactory = require('errors').factory;
const integrity = require('business/src/integrity');

const { Readable } = require('stream');

const cuid = require('cuid');

const DELETION_MODES_FIELDS = {
  'keep-authors': [
    'streamIds',
    'time',
    'duration',
    'type',
    'content',
    'description',
    'attachments',
    'clientData',
    'trashed',
    'created',
    'createdBy',
    'integrity',
  ],
  'keep-nothing': [
    'streamIds',
    'time',
    'duration',
    'type',
    'content',
    'description',
    'attachments',
    'clientData',
    'trashed',
    'created',
    'createdBy',
    'modified',
    'modifiedBy',
    'integrity',
  ],
};

/**
 * Storage for events.
 * Dispatches requests to each data store's events.
 */
class MallUserEvents {
  /**
   * @type {Map<string, UserEvents>}
   */
  eventsStores = new Map();
  /**
   * @type {Map<string, Object>}
   */
  storeSettings = new Map();

  /**
   * @param {DataStore[]} stores
   */
  constructor(stores) {
    for (const store of stores) {
      this.eventsStores.set(store.id, store.events);
      this.storeSettings.set(store.id, store.settings);
    }
  }

  // ----------------- GET ----------------- //

  /**
   * Specific to Mall, allow query of a single event
   * @param {*} userId
   * @param {*} fullEventId
   * @returns
   */
  async getOne(userId, fullEventId) {
    const [storeId, storeEventId] =
      storeDataUtils.parseStoreIdAndStoreItemId(fullEventId);
    const eventsStore = this.eventsStores.get(storeId);
    if (!eventsStore) return null;
    try {
      const paramsForStore = eventsQueryUtils.getStoreQueryFromParams({
        id: storeEventId,
        state: 'all',
        limit: 1,
        withDeletions: true,
      });
      const events: Array<Events> = await eventsStore.get(
        userId,
        paramsForStore
      );
      if (events?.length === 1)
        return eventsUtils.convertEventFromStore(storeId, events[0]);
    } catch (e) {
      storeDataUtils.throwAPIError(e, storeId);
    }
    return null;
  }

  async get(userId, params) {
    return await this.getWithParamsByStore(
      userId,
      eventsQueryUtils.getParamsByStore(params)
    );
  }

  /**
   * Specific to Mall, allow query with a prepared query by store
   */
  async getWithParamsByStore(userId, paramsByStore) {
    const res = [];
    for (let storeId of Object.keys(paramsByStore)) {
      const eventsStore = this.eventsStores.get(storeId);
      const params = paramsByStore[storeId];
      try {
        const paramsForStore = eventsQueryUtils.getStoreQueryFromParams(params);
        const events = await eventsStore.get(userId, paramsForStore);
        for (let event of events) {
          res.push(eventsUtils.convertEventFromStore(storeId, event));
        }
      } catch (e) {
        storeDataUtils.throwAPIError(e, storeId);
      }
    }
    return res;
  }

  async getStreamed(userId, params) {
    return await this.getStreamedWithParamsByStore(
      userId,
      eventsQueryUtils.getParamsByStore(params)
    );
  }

  /**
   * Specific to Mall, allow query with a prepared query by store
   */
  async getStreamedWithParamsByStore(userId, paramsByStore) {
    if (Object.keys(paramsByStore).length != 1) {
      return new Error('getStreamed only supported for one store at a time');
    }
    const storeId = Object.keys(paramsByStore)[0];
    const eventsStore = this.eventsStores.get(storeId);
    try {
      const paramsForStore = eventsQueryUtils.getStoreQueryFromParams(
        paramsByStore[storeId]
      );
      const eventsStreamFromDB = await eventsStore.getStreamed(
        userId,
        paramsForStore
      );
      return eventsStreamFromDB.pipe(
        new eventsUtils.ConvertEventFromStoreStream(storeId)
      );
    } catch (e) {
      storeDataUtils.throwAPIError(e, storeId);
    }
  }

  /**
   * To create a streamed result from multiple stores. 'events.get' pass a callback in order to add the streams
   * To the result;
   */
  async generateStreamsWithParamsByStore(
    userId,
    paramsByStore,
    addEventsStreamCallback
  ) {
    for (let storeId of Object.keys(paramsByStore)) {
      const settings = this.storeSettings.get(storeId);
      const params = paramsByStore[storeId];
      try {
        addEventsStreamCallback(
          settings,
          await this.getStreamedWithParamsByStore(userId, { [storeId]: params })
        );
      } catch (e) {
        storeDataUtils.throwAPIError(e, storeId);
      }
    }
  }

  // ----------------- CREATE ----------------- //

  /**
   *
   * @param {*} userId
   * @param {*} eventData
   */
  async create(userId, eventData, mallTransaction) {
    const { storeId, eventsStore, storeEvent, storeTransaction } =
      await this.prepareForStore(eventData, mallTransaction);
    try {
      const res = await eventsStore.create(
        userId,
        storeEvent,
        storeTransaction
      );
      return eventsUtils.convertEventFromStore(storeId, res);
    } catch (e) {
      storeDataUtils.throwAPIError(e, storeId);
    }
  }

  async createMany(userId, eventsData, mallTransaction) {
    for (let eventData of eventsData) {
      await this.create(userId, eventData, mallTransaction);
    }
  }

  // ----------------- ATTACHMENTS ----------------- //

  async saveAttachedFiles(
    userId: string,
    eventDataWithoutAttachments: any,
    isExistingEvent: boolean,
    attachmentsItems: Array<AttachmentItem>,
    mallTransaction?: MallTransaction
  ) {
    const { eventsStore, storeEvent, storeTransaction } =
      await this.prepareForStore(eventDataWithoutAttachments, mallTransaction);
    return await eventsStore.saveAttachedFiles(
      userId,
      storeEvent.id,
      attachmentsItems,
      storeTransaction
    );
  }

  async getAttachedFile(userId: string, eventData, fileId: string) {
    const [storeId, storeEventId] = storeDataUtils.parseStoreIdAndStoreItemId(
      eventData.id
    );
    const eventsStore = this.eventsStores.get(storeId);
    if (!eventsStore) return null;
    return await eventsStore.getAttachedFile(userId, storeEventId, fileId);
  }

  async deleteAttachedFile(
    userId: string,
    eventData: any,
    fileId: string,
    mallTransaction?: MallTransaction
  ) {
    const { eventsStore, storeEvent, storeTransaction } =
      await this.prepareForStore(eventData, mallTransaction);
    return await eventsStore.deleteAttachedFile(
      userId,
      storeEvent.id,
      fileId,
      storeTransaction
    );
  }

  async createWithAttachments(
    userId: string,
    eventDataWithoutAttachments: any,
    attachmentsItems: Array<AttachmentItem>,
    mallTransaction?: MallTransaction
  ): Promise<void> {
    const attachmentsResponse = await this.saveAttachedFiles(
      userId,
      eventDataWithoutAttachments,
      false,
      attachmentsItems,
      mallTransaction
    );
    const eventDataWithNewAttachments = _attachmentsResponseToEvent(
      eventDataWithoutAttachments,
      attachmentsResponse,
      attachmentsItems
    );
    return await this.create(
      userId,
      eventDataWithNewAttachments,
      mallTransaction
    );
  }

  async updateWithAttachments(
    userId: string,
    eventDataWithoutNewAttachments: any,
    newAttachmentsItems: Array<AttachmentItem>,
    mallTransaction?: MallTransaction
  ): Promise<void> {
    const attachmentsResponse = await this.saveAttachedFiles(
      userId,
      eventDataWithoutNewAttachments,
      true,
      newAttachmentsItems,
      mallTransaction
    );
    const eventDataWithNewAttachments = _attachmentsResponseToEvent(
      eventDataWithoutNewAttachments,
      attachmentsResponse,
      newAttachmentsItems
    );
    return await this.update(
      userId,
      eventDataWithNewAttachments,
      mallTransaction
    );
  }

  async updateDeleteAttachment(
    userId: string,
    eventData: any,
    attachmentId: string,
    mallTransaction?: MallTransaction
  ): Promise<void> {
    await this.deleteAttachedFile(
      userId,
      eventData,
      attachmentId,
      mallTransaction
    );
    const newEventData = _.cloneDeep(eventData);
    newEventData.attachments = newEventData.attachments.filter((attachment) => {
      return attachment.id !== attachmentId;
    });
    return await this.update(userId, newEventData, mallTransaction);
  }

  // ----------------- UPDATE ----------------- //

  async update(userId, eventData, mallTransaction) {
    const [storeId] = storeDataUtils.parseStoreIdAndStoreItemId(eventData.id);
    const storeEvent = eventsUtils.convertEventToStore(storeId, eventData);

    // update integrity field and recalculate if needed
    // integrity caclulation is done on event.id and streamIds that includes the store prefix
    delete storeEvent.integrity;
    if (integrity.events.isActive) {
      integrity.events.set(storeEvent);
    }

    // replace all streamIds by store-less streamIds
    if (storeEvent?.streamIds) {
      const storeStreamIds = [];
      for (const fullStreamId of storeEvent.streamIds) {
        const [streamStoreId, storeStreamId] =
          storeDataUtils.parseStoreIdAndStoreItemId(fullStreamId);
        if (streamStoreId != storeId) {
          throw errorFactory.invalidRequestStructure(
            'events cannot be moved to a different store',
            eventData
          );
        }
        storeStreamIds.push(storeStreamId);
      }
      storeEvent.streamIds = storeStreamIds;
    }

    const eventsStore = this.eventsStores.get(storeId);
    const storeTransaction = mallTransaction
      ? await mallTransaction.getStoreTransaction(storeId)
      : null;
    try {
      const success = await eventsStore.update(
        userId,
        storeEvent,
        storeTransaction
      );
      if (!success) {
        throw errorFactory.invalidItemId(
          'Could not update event with id ' + eventData.id
        );
      }
      return eventsUtils.convertEventFromStore(storeId, storeEvent);
    } catch (e) {
      storeDataUtils.throwAPIError(e, storeId);
    }
  }

  /**
   * Utility to change streams for multiple matching events
   * @param {string} userId - userId
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
  async updateMany(userId, query, update, mallTransaction): Array {
    const streamedUpdate = await this.updateStreamedMany(
      userId,
      query,
      update,
      mallTransaction
    );
    const result = [];
    for await (let event of streamedUpdate) {
      result.push(event);
    }
    return result;
  }

  /**
   * Utility to change streams for multiple matching events
   * @param {string} userId - userId
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
  async updateStreamedMany(
    userId,
    query,
    update = {},
    mallTransaction
  ): Readable {
    const paramsByStore = eventsQueryUtils.getParamsByStore(query);

    // fetch events to be updated
    const streamedMatchingEvents = await this.getStreamedWithParamsByStore(
      userId,
      paramsByStore
    );

    const mallEvents = this;
    async function* reader() {
      for await (const eventData of streamedMatchingEvents) {
        const newEventData = _.merge(eventData, update.fieldsToSet);
        if (update.addStreams && update.addStreams.length > 0) {
          newEventData.streamIds = _.union(
            newEventData.streamIds,
            update.addStreams
          );
        }
        if (update.removeStreams && update.removeStreams.length > 0) {
          newEventData.streamIds = _.difference(
            newEventData.streamIds,
            update.removeStreams
          );
        }

        // eventually remove fields from event
        if (update.fieldsToDelete && update.fieldsToDelete.length > 0) {
          // remove attachments if needed
          if (
            update.fieldsToDelete.includes('attachments') &&
            eventData.attachments != null
          ) {
            for (let attachment of eventData.attachments) {
              await mallEvents.deleteAttachedFile(
                userId,
                eventData,
                attachment.id,
                mallTransaction
              );
            }
          }

          for (let field of update.fieldsToDelete) {
            delete newEventData[field];
          }
        }
        if (update.filter == null || update.filter(newEventData)) {
          const updatedEvent = await mallEvents.update(
            userId,
            newEventData,
            mallTransaction
          );
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
   * @param {*} userId
   * @param {*} eventId
   */
  async updateMinimizeEventHistory(userId, eventId) {
    const fieldsToDelete = [
      'streamIds',
      'time',
      'endTime',
      'type',
      'content',
      'tags',
      'description',
      'attachments',
      'clientData',
      'trashed',
      'created',
      'createdBy',
      'integrity',
    ];
    const res = await this.updateMany(
      userId,
      { headId: eventId, state: 'all', withDeletions: true },
      { fieldsToDelete }
    );
    return res;
  }

  // ----------------- DELETE / UPDATE ----------------- //

  /**
   * Utility to remove data from event history (versions)
   * @param {*} userId
   * @param {string} deletionMode one of 'keep-nothing', 'keep-authors'
   * @param {any} query get query
   * @param {MallTransaction} mallTransaction
   * @returns {Promise<Array<Events>>}
   **/
  async updateDeleteByMode(userId, deletionMode, query, mallTransaction) {
    const fieldsToSet = { deleted: Date.now() / 1000 };
    const fieldsToDelete = DELETION_MODES_FIELDS[deletionMode] || ['integrity'];

    await this.updateMany(
      userId,
      query,
      { fieldsToSet, fieldsToDelete },
      mallTransaction
    );
  }

  // ----------------- DELETE ----------------- //

  async delete(userId, query) {
    const paramsByStore = eventsQueryUtils.getParamsByStore(query);
    for (let storeId of Object.keys(paramsByStore)) {
      const eventsStore = this.eventsStores.get(storeId);
      const params = paramsByStore[storeId];
      try {
        const paramsForStore = eventsQueryUtils.getStoreQueryFromParams(params);
        await eventsStore.delete(userId, paramsForStore);
      } catch (e) {
        storeDataUtils.throwAPIError(e, storeId);
      }
    }
  }

  // ----------------- UTILS -----------------

  /**
   * Common utils for events.create and events.createWithAttachmentss
   * @param {Object} eventData
   * @param {MallTransaction} [mallTransaction]
   * @private
   * @returns
   */
  async prepareForStore(eventData, mallTransaction) {
    let storeId = null;

    // add eventual missing id and get storeId from first streamId then
    if (eventData.id == null) {
      [storeId] = storeDataUtils.parseStoreIdAndStoreItemId(
        eventData.streamIds[0]
      );
      eventData.id = storeDataUtils.getFullItemId(storeId, cuid());
    } else {
      // get storeId from event id
      [storeId] = storeDataUtils.parseStoreIdAndStoreItemId(eventData.id);
    }

    // set integrity
    integrity.events.set(eventData);

    const storeEvent = eventsUtils.convertEventToStore(storeId, eventData);
    const eventsStore = this.eventsStores.get(storeId);
    const storeTransaction = mallTransaction
      ? await mallTransaction.getStoreTransaction(storeId)
      : null;

    return { storeId, eventsStore, storeEvent, storeTransaction };
  }
}

module.exports = MallUserEvents;

/**
 * Add attachment response to eventData
 */
function _attachmentsResponseToEvent(
  eventDataWithoutNewAttachments,
  attachmentsResponse,
  attachmentsItems
) {
  const eventDataWithNewAttachments = _.cloneDeep(
    eventDataWithoutNewAttachments
  );
  eventDataWithNewAttachments.attachments =
    eventDataWithNewAttachments.attachments || [];
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
