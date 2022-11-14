/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Local Data Store.
 * Events implementation
 */

const errorFactory = require('errors').factory;

class LocalUserEvents {
  storage: any;
  eventsFileStorage: any;

  constructor(storage: any, eventsFileStorage: any) {
    this.storage = storage;
    this.eventsFileStorage = eventsFileStorage;
  }

  async update(userId, eventData, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      return db.updateEvent(eventData.id, eventData);
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') {
        throw errorFactory.itemAlreadyExists('event', {id: eventId}, err);
      }
      throw errorFactory.unexpectedError(err);
    }
  }

  async create(userId, event, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      await db.createEvent(event);
      return event;
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') {
        throw errorFactory.itemAlreadyExists('event', {id: event.id}, err);
      }
      throw errorFactory.unexpectedError(err);
    }
  }

  async saveAttachedFiles(userId: string, eventId, attachmentsItems: Array<AttachmentItem>, transaction?: Transaction) {
    const attachmentsResponse = [];
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, eventId);
      attachmentsResponse.push({id: fileId});
    }
    return attachmentsResponse;
  }

  async getAttachedFile (userId: string, eventId, fileId: string) {
    return this.eventsFileStorage.getAttachedFileStream(userId, eventId, fileId);
  }

  async deleteAttachedFile(userId: string, eventId, fileId: string, transaction?: Transaction) {
    return await this.eventsFileStorage.removeAttachedFile(userId, eventId, fileId);
  }

  async getStreamed(userId, params) {
    const db = await this.storage.forUser(userId);
    return db.getEventsStream(params);
  }

  async get(userId, params) {
    const db = await this.storage.forUser(userId);
    return db.getEvents(params);
  }

  async delete(userId, params, transaction) {
    const db = await this.storage.forUser(userId);

    // here we should delete attachments linked to deleted events.

    return db.deleteEvents(params);
  }

  async _deleteUser(userId: string): Promise<void> {
    return await this.delete(userId, {query: []});
  }

  async _storageUsedForUser(userId: string) {
    const db = await this.storage.forUser(userId);
    return db.eventsCount();
  }
}

module.exports = LocalUserEvents;
