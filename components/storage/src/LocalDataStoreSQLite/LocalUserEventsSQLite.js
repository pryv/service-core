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

const DELTA_TO_CONSIDER_IS_NOW = 5; // 5 seconds
class LocalUserEvents extends DataStore.UserEvents {
  storage: any;
  eventsFileStorage: any;

  constructor(storage: any, eventsFileStorage: any) {
    super();
    this.storage = storage;
    this.eventsFileStorage = eventsFileStorage;
  }

  async update(userId, eventId, fieldsToSet, fieldsToDelete, transaction) {
    const db = await this.storage.forUser(userId);
    try {
      return db.updateEvent(eventId, fieldsToSet, fieldsToDelete);
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

  async createWithAttachments(userId: string, partialEventData: {}, attachmentsItems: Array<AttachmentItem>, finalizeEventCallBack: Promise<{}>, transaction?: Transaction): Promise<void> {
    const attachmentsResponse = [];
    
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, partialEventData.id);
      attachmentsResponse.push({id: fileId});
    }
    const eventData = await finalizeEventCallBack(attachmentsResponse);
    return await this.create(userId, eventData, transaction);
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
    return db.deleteEvents(params);
  }

  // ----------------- attachments ----------------- //
  async attachmentAdd(userId: string, partialEventData: {}, attachmentsItems: Array<AttachmentItem>, finalizeEventCallBack: Promise<{}>, transaction?: Transaction) {
    const attachmentsResponse = [];
    
    for (const attachment of attachmentsItems) {
      const fileId = await this.eventsFileStorage.saveAttachedFileFromStream(attachment.attachmentData, userId, partialEventData.id);
      attachmentsResponse.push({id: fileId});
    }
    const eventData = await finalizeEventCallBack(attachmentsResponse);
    return await this.update(userId, eventData, {}, transaction);
  }

  async _deleteUser(userId: string): Promise<void> {
    return await this.delete(userId, {fromTime: 0});
  }

  async _storageUsedForUser(userId: string) { 
    const db = await this.storage.forUser(userId);
    return db.eventsCount();
  }
}

module.exports = LocalUserEvents;
