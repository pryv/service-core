/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const ds = require('@pryv/datastore');
const errors = ds.errors;
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const DeletionModesFields = require('../DeletionModesFields');
const { localStorePrepareOptions, localStorePrepareQuery } = require('../localStoreEventQueries');
const timestamp = require('unix-timestamp');

/**
 * Local data store: events implementation.
 */
module.exports = ds.createUserEvents({
  storage: null,
  eventsFileStorage: null,
  deletionSettings: null,
  keepHistory: null,
  setIntegrityOnEvent: null,

  init (storage, eventsFileStorage, settings, setIntegrityOnEventFn) {
    this.storage = storage;
    this.eventsFileStorage = eventsFileStorage;
    this.settings = settings;
    this.setIntegrityOnEvent = setIntegrityOnEventFn;
    this.deletionSettings = {
      mode: this.settings.versioning?.deletionMode || 'keep-nothing'
    };
    this.deletionSettings.fields = DeletionModesFields[this.deletionSettings.mode] || ['integrity'];
    this.deletionSettings.removeAttachments = this.deletionSettings.fields.includes('attachments');
    this.keepHistory = this.settings.versioning?.forceKeepHistory || false;
  },

  async getOne (userId, eventId) {
    const db = await this.storage.forUser(userId);
    return db.getOneEvent(eventId);
  },

  /**
   * @returns {Promise<any>}
   */
  async get (userId, storeQuery, storeOptions) {
    const db = await this.storage.forUser(userId);
    const query = localStorePrepareQuery(storeQuery);
    const options = localStorePrepareOptions(storeOptions);
    return db.getEvents({ query, options });
  },

  /**
   * @returns {Promise<any>}
   */
  async getStreamed (userId, storeQuery, storeOptions) {
    const db = await this.storage.forUser(userId);
    const query = localStorePrepareQuery(storeQuery);
    const options = localStorePrepareOptions(storeOptions);
    return db.getEventsStreamed({ query, options });
  },

  /**
   * @returns {Promise<any>}
   */
  async getDeletionsStreamed (userId, query, options) {
    const db = await this.storage.forUser(userId);
    return db.getEventDeletionsStreamed(query.deletedSince);
  },

  /**
   * @returns {Promise<any>}
   */
  async getHistory (userId, eventId) {
    const db = await this.storage.forUser(userId);
    return db.getEventHistory(eventId);
  },

  /**
   * @returns {Promise<any>}
   */
  async create (userId, event, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      await db.createEvent(event);
      return event;
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') {
        throw errors.itemAlreadyExists('event', { id: event.id }, err);
      }
      throw errors.unexpectedError(err);
    }
  },

  async addAttachment (userId, eventId, attachmentItem, transaction) {
    const desiredId = attachmentItem.id || null; // id is assigned during tests (to be removed)
    delete attachmentItem.id;
    const fileId = await this.eventsFileStorage.saveAttachmentFromStream(attachmentItem.attachmentData, userId, eventId, desiredId);
    const attachment = Object.assign({ id: fileId }, attachmentItem);
    delete attachment.attachmentData;
    const event = await this.getOne(userId, eventId);
    event.attachments ??= [];
    event.attachments.push(attachment);
    this.setIntegrityOnEvent(event);
    await this.update(userId, event, transaction);
    return event;
  },
  /**
   * @param {string} userId
   * @param {string} fileId
   * @returns {Promise<any>}
   */
  async getAttachment (userId, eventId, fileId) {
    return this.eventsFileStorage.getAttachmentStream(userId, eventId, fileId);
  },

  /**
   * @param {string} userId
   * @param {string} fileId
   * @param {Transaction} transaction
   * @returns {Promise<any>}
   */
  async deleteAttachment (userId, eventId, fileId, transaction) {
    const eventData = await this.getOne(userId, eventId);
    const newEventData = structuredClone(eventData);
    newEventData.attachments = newEventData.attachments.filter((attachment) => {
      return attachment.id !== fileId;
    });
    await this.eventsFileStorage.removeAttachment(userId, eventId, fileId);
    this.setIntegrityOnEvent(newEventData);
    await this.update(userId, newEventData, transaction);
    return newEventData;
  },

  /**
   * @returns {Promise<any>}
   */
  async update (userId, eventData, transaction) {
    const db = await this.storage.forUser(userId);
    await this._generateVersionIfNeeded(db, eventData.id, null, transaction);
    try {
      return db.updateEvent(eventData.id, eventData);
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') {
        throw errors.itemAlreadyExists('event', { id: eventData.id }, err);
      }
      throw errors.unexpectedError(err);
    }
  },

  /**
   * @returns {Promise<any>}
   */
  async delete (userId, originalEvent, transaction) {
    const db = await this.storage.forUser(userId);
    await this._generateVersionIfNeeded(db, originalEvent.id, originalEvent, transaction);
    const deletedEventContent = structuredClone(originalEvent);
    const eventId = deletedEventContent.id;

    // if attachments are to be deleted
    if (this.deletionSettings.removeAttachments && deletedEventContent.attachments != null && deletedEventContent.attachments.length > 0) {
      await this.eventsFileStorage.removeAllForEvent(userId, eventId);
    }
    // eventually delete or update history
    if (this.deletionSettings.mode === 'keep-nothing') await db.deleteEventHistory(eventId);
    if (this.deletionSettings.mode === 'keep-authors') {
      await db.minimizeEventHistory(eventId, this.deletionSettings.fields);
    }

    // prepare event content for DB
    deletedEventContent.deleted = timestamp.now();
    for (const field of this.deletionSettings.fields) {
      delete deletedEventContent[field];
    }
    this.setIntegrityOnEvent(deletedEventContent);
    delete deletedEventContent.id;
    return await db.updateEvent(eventId, deletedEventContent);
  },

  async _generateVersionIfNeeded (db, eventId, originalEvent = null, transaction = null) {
    if (!this.keepHistory) return;
    let versionItem = null;
    if (originalEvent != null) {
      versionItem = structuredClone(originalEvent);
    } else {
      versionItem = await db.getOneEvent(eventId);
    }
    versionItem.headId = eventId;
    versionItem.id = cuid();
    await db.createEvent(versionItem);
  },

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async _deleteUser (userId) {
    const db = await this.storage.forUser(userId);
    await this.eventsFileStorage.removeAllForUser({ id: userId });
    return await db.deleteEvents({ query: [] });
  },

  /**
   * @param {string} userId
   * @returns {Promise<any>}
   */
  async _getStorageInfos (userId) {
    const db = await this.storage.forUser(userId);
    const count = db.countEvents();
    return { count };
  },

  async _getFilesStorageInfos (userId) {
    const sizeKb = await this.eventsFileStorage.getTotalSize({ userId });
    return { sizeKb };
  },

  /**
    * Local stores only - as long as SystemStreams are embedded
    */
  async removeAllNonAccountEventsForUser (userId) {
    const db = await this.storage.forUser(userId);
    const allAccountStreamIds = SystemStreamsSerializer.getAccountStreamIds();
    const query = [{ type: 'streamsQuery', content: [[{ any: ['*'] }, { not: allAccountStreamIds }]] }];
    const res = await db.deleteEvents({ query, options: {} });
    await this.eventsFileStorage.removeAllForUser({ id: userId });
    return res;
  }
});
