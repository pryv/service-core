/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Local Data Store.
 * Events implementation
 */
const errorFactory = require('errors').factory;

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const DELETION_MODES_FIELDS = require('../eventsDeletionsModes');
const { integrity } = require('business');

class LocalUserEvents {
  storage;
  eventsFileStorage;
  deletionSettings;

  constructor (storage, eventsFileStorage, settings) {
    this.storage = storage;
    this.eventsFileStorage = eventsFileStorage;
    this.settings = settings;
    this.deletionSettings = {
      mode: this.settings.versioning?.deletionMode || 'keep-nothing'
    };
    this.deletionSettings.fields = DELETION_MODES_FIELDS[this.deletionSettings.mode] || ['integrity'];
    this.deletionSettings.removeAttachments = this.deletionSettings.fields.includes('attachments');
  }

  /**
   * @returns {Promise<any>}
   */
  async update (userId, eventData, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      return db.updateEvent(eventData.id, eventData);
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') {
        throw errorFactory.itemAlreadyExists('event', { id: eventData.id }, err);
      }
      throw errorFactory.unexpectedError(err);
    }
  }

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
        throw errorFactory.itemAlreadyExists('event', { id: event.id }, err);
      }
      throw errorFactory.unexpectedError(err);
    }
  }

  /**
   * @param {string} userId
   * @param {Array<AttachmentItem>} attachmentsItems
   * @param {Transaction} transaction
   * @returns {Promise<any[]>}
   */
  async saveAttachedFiles (userId, eventId, attachmentsItems, transaction) {
    const attachmentsResponse = [];
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, eventId);
      attachmentsResponse.push({ id: fileId });
    }
    return attachmentsResponse;
  }

  /**
   * @param {string} userId
   * @param {string} fileId
   * @returns {Promise<any>}
   */
  async getAttachedFile (userId, eventId, fileId) {
    return this.eventsFileStorage.getAttachedFileStream(userId, eventId, fileId);
  }

  /**
   * @param {string} userId
   * @param {string} fileId
   * @param {Transaction} transaction
   * @returns {Promise<any>}
   */
  async deleteAttachedFile (userId, eventId, fileId, transaction) {
    return await this.eventsFileStorage.removeAttachedFile(userId, eventId, fileId);
  }

  /**
   * @returns {Promise<any>}
   */
  async getStreamed (userId, params) {
    const db = await this.storage.forUser(userId);
    return db.getEventsStream(params);
  }

  /**
   * @returns {Promise<any>}
   */
  async getDeletionsStreamed (userId, params) {
    const db = await this.storage.forUser(userId);
    return db.getEventsDeletionsStream(params);
  }

  /**
   * @returns {Promise<any>}
   */
  async getHistory (userId, eventId) {
    const db = await this.storage.forUser(userId);
    return db.getEventsHistory(eventId);
  }

  /**
   * @returns {Promise<any>}
   */
  async get (userId, params) {
    const db = await this.storage.forUser(userId);
    return db.getEvents(params);
  }

  async getOne (userId, eventId) {
    const db = await this.storage.forUser(userId);
    return db.getOneEvent(eventId);
  }

  /**
   * @returns {Promise<any>}
   */
  async delete (userId, originalEvent, transaction) {
    const db = await this.storage.forUser(userId);
    const deletedEventContent = Object.assign({}, originalEvent);
    const eventId = deletedEventContent.id;

    // if attachments are to be deleted
    if (this.deletionSettings.removeAttachments && deletedEventContent.attachments != null && deletedEventContent.attachments.length > 0) {
      await this.eventsFileStorage.removeAllForEvent(userId, eventId);
    }
    // eventually delete or update history
    if (this.deletionSettings.mode === 'keep-nothing') await db.deleteEventsHistory(eventId);
    if (this.deletionSettings.mode === 'keep-authors') {
      await db.minimizeEventHistory(eventId, this.deletionSettings.fields);
    }

    // prepare event content for mongodb
    deletedEventContent.deleted = Date.now() / 1000;
    for (const field of this.deletionSettings.fields) {
      delete deletedEventContent[field];
    }
    integrity.events.set(deletedEventContent);
    delete deletedEventContent.id;
    return await db.updateEvent(eventId, deletedEventContent);
  }

  /**
    * LocalStores Only - as long as SystemStreams are embeded
    */
  async removeAllNonAccountEventsForUser (userId) {
    const db = await this.storage.forUser(userId);
    const allAccountStreamIds = SystemStreamsSerializer.getAccountStreamIds();
    const query = [{ type: 'streamsQuery', content: [{ any: ['*'], and: [{ not: allAccountStreamIds }] }] }];
    const res = await db.deleteEvents({ query, options: {} });
    return res;
  }

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async _deleteUser (userId) {
    const db = await this.storage.forUser(userId);
    return await db.deleteEvents({ query: [] });
  }

  /**
   * @param {string} userId
   * @returns {Promise<any>}
   */
  async _storageUsedForUser (userId) {
    const db = await this.storage.forUser(userId);
    return db.eventsCount();
  }
}
module.exports = LocalUserEvents;
