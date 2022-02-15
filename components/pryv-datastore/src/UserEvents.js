/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const errors = require('./errors');
const Transaction = require('./Transaction');

/**
 * Per-user events data
 */
class UserEvents {

  /**
   * Get the events for this user.
   * @param {identifier} uid
   * @param {object} params - event query
   * @param {boolean} [params.includeDeletions] - default false
   * @param {timestamp} [params.deletedSince] - default null, override includeDeletions. Only returns deleted events, sorted by deletion date descending
   * @param {boolean} [params.includeHistory] - default false
   * @returns {Array<Event>}
   * @see https://api.pryv.com/reference/#get-events
   */
  async get(uid: string, params): Promise<Array<Event>> { throw(errors.unsupportedOperation('events.get')); }

  /**
   * Get the events as a stream for this user.
   * @param {identifier} uid
   * @param {object} params - event query
   * @returns {ReadableStream}
   * @see https://api.pryv.com/reference/#get-events
   */
  async getStreamed(uid: string, params): Promise<ReadableStream> { throw(errors.unsupportedOperation('events.getStreamed')); }

  /**
   * @see https://api.pryv.com/reference/#create-event
   * @param {identifier} uid
   * @param {EventData} eventData
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Event} - The created event
   */
  async create(uid: string, eventData: {}, transaction?: Transaction): Promise<void>  { throw(errors.unsupportedOperation('events.create')); }


  /**
   * Object to pass when creating events with attachments or adding attachments to events
   * @typedef {Object} AttachmentItem 
   * @property {size} [number] - The size of the attachment 
   * @property {string} filename fileName 
   * @property {ReadableStream} attachmentData 
   * @property {integrity} [integrity] - The integrity checksum of the attachment 
   */

  /**
   * Informations sent by the store after saving attachment 
   * @typedef {Object} AttachmentResponseItem
   * @param {string} id - mandatory id of the attachement - unique - per event 
   */

   /**
     * After Attachments have been fully Reaad, integrity checksum can be computed and set. 
     * @typedef {Promise} FinalizeEventCallBack
     * @param {Array<AttachmentResponseItem>} attachmentsResponse
     * @return {EventData} eventData - The event data with integrity and attachments property
     */

  /**
   * @see https://api.pryv.com/reference/#create-event
   * @param {identifier} uid
   * @param {any} partialEventData - eventData (without attachments and integrity property)
   * @param {Array<AttachmentItem>} attachmentsItems - Array of attachments informations. 
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Event} - The created event
   */
   async createWithAttachment(uid: string, partialEventData: {}, attachmentsItems: Array<AttachmentItem>, finalizeEventCallBack: Promise<{}>, transaction?: Transaction): Promise<void>  { throw(errors.unsupportedOperation('events.create with attachment')); }

   /**
   * @see https://api.pryv.com/reference/#create-event
   * @param {identifier} uid
   * @param {string} eventId
   * @param {Array<AttachmentItem>} attachmentsItems - The data to attach
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Event} - The created event
   */
    async addAttachment(uid: string, eventId: string, attachmentsItems: Array<AttachmentItem>, finalizeEventCallBack: Promise<{}>, transaction?: Transaction): Promise<void>  { throw(errors.unsupportedOperation('events.addAttachment')); }

  /**
   * @see https://api.pryv.com/reference/#update-event
   * @param {identifier} uid 
   * @param {string} eventId 
   * @param {any} fieldsToSet - Object with fields to set
   * @param {Array<string>} fieldsToDelete - Array of fields to delete
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Event} - the updated event
   */
   async update(uid: string, eventId: string, fieldsToSet: any, fieldsToDelete: Array<string>): Promise<void> { throw(errors.unsupportedOperation('events.update')); }


  /**
   * @see https://api.pryv.com/reference/#delete-event
   * @param {identifier} uid
   * @throws item-already-exists
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Event|EventDeletionItem} - The trashed Event
   */
  async delete(uid: string, eventId: string, params): Promise<void> { throw(errors.unsupportedOperation('events.delete')); }

  /**
   * Attachments methods
   */

  /**
   * Series methods? do we have specific methods for series ... ?
   */

}

module.exports = UserEvents;
