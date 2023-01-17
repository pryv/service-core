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

class LocalUserEvents {
  storage;

  eventsFileStorage;
  constructor (storage, eventsFileStorage) {
    this.storage = storage;
    this.eventsFileStorage = eventsFileStorage;
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
  async get (userId, params) {
    const db = await this.storage.forUser(userId);
    return db.getEvents(params);
  }

  /**
   * @returns {Promise<any>}
   */
  async delete (userId, params, transaction) {
    const db = await this.storage.forUser(userId);
    // here we should delete attachments linked to deleted events.
    return db.deleteEvents(params);
  }

  /**
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async _deleteUser (userId) {
    return await this.delete(userId, { query: [] });
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
