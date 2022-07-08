/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const errors = require('./errors');

/**
 * @typedef {import('./index')} index
 * @typedef {import('./DataStore')} DataStore
 */

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
 * Prototype object for per-user events data.
 * {@link DataStore#events} must return an implementation that inherits from this via {@link index#createUserEvents}.
 */
const UserEvents = module.exports = {
  /* eslint-disable no-unused-vars */

  /**
   * Get the events for this user.
   * @param {identifier} userId
   * @param {object} params - event query
   * @param {boolean} [params.includeDeletions] - default false
   * @param {timestamp} [params.deletedSince] - default null, override includeDeletions. Only returns deleted events, sorted by deletion date descending
   * @param {boolean} [params.includeHistory] - default false
   * @returns {Array<Event>}
   * @see https://api.pryv.com/reference/#get-events
   */
  async get (userId, params) { throw errors.unsupportedOperation('events.get'); },

  /**
   * Get the events as a stream for this user.
   * @param {identifier} userId
   * @param {object} params - event query
   * @returns {ReadableStream}
   * @see https://api.pryv.com/reference/#get-events
   */
  async getStreamed (userId, params) { throw errors.unsupportedOperation('events.getStreamed'); },

  /**
   * @see https://api.pryv.com/reference/#create-event
   * @param {identifier} userId
   * @param {EventData} eventData
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {Event} - The created event
   */
  async create (userId, eventData) { throw errors.unsupportedOperation('events.create'); },

  /**
   * @param {identifier} userId
   * @param {any} partialEventData - eventData (without the new attachments and integrity property)
   * @param {boolean} isExistingEvent - true if the event already exists
   * @param {Array<AttachmentItem>} attachmentsItems - Array of attachments informations.
   * @throws item-already-exists
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {AttachmentResponseItem} - The ids and other information related to the attachments
   */
  async attachmentsLoad (userId, partialEventData, isExistingEvent, attachmentsItems) { throw errors.unsupportedOperation('events.attachmentsLoad'); },

  /**
   * @param {identifier} userId
   * @param {any} eventData - eventData
   * @param {string} attachmentId - attachmentId
   * @throws invalid-item-id
   * @throws resource-is-readonly <=== Thrown either because Storage or Parent stream is readonly
   * @returns {AttachmentResponseItem} - The ids and other information related to the attachments
   */
  async attachmentDelete (userId, eventData, attachmentId) { throw errors.unsupportedOperation('events.attachmentDelete'); },

  /**
   * Fully replace an event with new Data
   * @param {identifier} userId
   * @param {any} eventData - New event data
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {boolean} - true if an event was updated
   */
  async update (userId, eventData) { throw errors.unsupportedOperation('events.replace'); },

  /**
   * @see https://api.pryv.com/reference/#delete-event
   * @param {identifier} userId
   * @throws item-already-exists
   * @throws resource-is-readonly <=== Thrown because item cannot be updated
   * @returns {Event|EventDeletionItem} - The trashed Event
   */
  async delete (userId, eventId, params) { throw errors.unsupportedOperation('events.delete'); }
};

// limit tampering on existing properties
for (const propName of Object.getOwnPropertyNames(UserEvents)) {
  Object.defineProperty(UserEvents, propName, { configurable: false });
}
