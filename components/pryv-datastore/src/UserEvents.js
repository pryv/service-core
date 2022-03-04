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
   * @param {identifier} uid
   * @param {any} partialEventData - eventData (without the new attachments and integrity property)
   * @param {boolean} isExistingEvent - true if the event already exists
   * @param {Array<AttachmentItem>} attachmentsItems - Array of attachments informations. 
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {AttachmentResponseItem} - The ids and other information related to the attachments
   */
  async attachmentsLoad(uid: string, partialEventData, isExistingEvent, attachmentsItems: Array<AttachmentItem>, transaction?: Transaction) { throw(errors.unsupportedOperation('events.attachmentsLoad')); }

  /**
   * @param {identifier} uid
   * @param {any} eventData - eventData 
   * @param {string} attachmentId - attachmentId
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {AttachmentResponseItem} - The ids and other information related to the attachments
   */
  async attachmentDelete(uid: string, eventData, attachmentId: string, transaction?: Transaction) { throw(errors.unsupportedOperation('events.attachmentDelete')); }

  /**
   * Fully replace an event with new Data
   * @param {identifier} uid 
   * @param {any} eventData - New event data
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {boolean} - true if an event was updated
   */
  async update(uid: string, eventData: any): Promise<void> { throw(errors.unsupportedOperation('events.replace')); }


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
