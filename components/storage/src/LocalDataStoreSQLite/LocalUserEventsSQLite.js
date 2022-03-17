/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Local Data Store.
 * Events implementation
 */

const bluebird = require('bluebird');
const _ = require('lodash');
const Readable = require('stream').Readable;

const streamsQueryUtils = require('api-server/src/methods/helpers/streamsQueryUtils');

const {DataStore, errors}  = require('pryv-datastore');

class LocalUserEvents extends DataStore.UserEvents {
  storage: any;
  eventsFileStorage: any;

  constructor(storage: any, eventsFileStorage: any) {
    super();
    this.storage = storage;
    this.eventsFileStorage = eventsFileStorage;
  }

  async update(userId, eventData, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      return db.updateEvent(eventData.id, eventData);
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') {
        throw errors.itemAlreadyExists('event', {id: eventId}, err);
      }
      throw errors.unexpectedError(err);
    }
  }

  async create(userId, event, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      await db.createEvent(event);
      return event;
    } catch (err) {
      if (err.message === 'UNIQUE constraint failed: events.eventid') { 
        throw errors.itemAlreadyExists('event', {id: event.id}, err);
      }
      throw errors.unexpectedError(err);
    }
  }


  async attachmentsLoad(userId: string, eventData, isExistingEvent, attachmentsItems: Array<AttachmentItem>, transaction?: Transaction) {
    const attachmentsResponse = [];
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, eventData.id);
      attachmentsResponse.push({id: fileId});
    }
    return attachmentsResponse;
  }

  async attachmentDelete(uid: string, eventData, attachmentId: string, transaction?: Transaction) { 
    for (const attachment of eventData.attachments) {
      if (attachment.id === attachmentId) {
        await this.eventsFileStorage.removeAttachedFile(uid, eventData.id, attachmentId);
        return true;
      }
    }
    return false;
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
