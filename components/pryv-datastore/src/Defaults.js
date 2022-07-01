/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Data store constants and helper methods.
 */
const Defaults = module.exports = {
  /**
   * Timestamp representing an unknown creation/modification time.
   * @type {number}
   */
  UnknownDate: 10000000.00000001,
  /**
   * 'System' access id for created by / modified by.
   * @type {string}
   */
  SystemAccessId: 'system',
  /**
   * 'Unknown' access id for created by / modified by.
   * @type {string}
   */
  UnknownAccessId: 'unknown',
  /**
   * Access id prefix used to tag external identifiers for created by / modified by.
   * @type {string}
   */
  ExternalAccessIdPrefix: 'external-',

  applyOnEvent,
  applyOnEvents,
  applyOnStream,
  applyOnStreams
};
Object.freeze(Defaults);

/**
 * Adds missing mandatory properties to the given event.
 * **Note**: mutates the event object.
 * @param {Object} event
 */
function applyOnEvent (event) {
  if (typeof event.created === 'undefined') { event.created = Defaults.UnknownDate; }
  if (typeof event.modified === 'undefined') { event.modified = Defaults.UnknownDate; }
  if (typeof event.createdBy === 'undefined') { event.createdBy = Defaults.UnknownAccessId; }
  if (typeof event.modifiedBy === 'undefined') { event.modifiedBy = Defaults.UnknownAccessId; }
}
/**
 * Adds missing mandatory properties to the given events.
 * **Note**: mutates the event objects.
 * @param {Object[]} events
 */
function applyOnEvents (events) {
  events.forEach(applyOnEvent);
}

/**
 * Adds missing mandatory properties to the given stream and its children (if present).
 * **Note**: mutates the stream object.
 * @param {Object} stream
 * @param {[string]} parentId  - for parentId of the stream
 */
function applyOnStream (stream, parentId = null) {
  if (typeof stream.created === 'undefined') { stream.created = Defaults.UnknownDate; }
  if (typeof stream.modified === 'undefined') { stream.modified = Defaults.UnknownDate; }
  if (typeof stream.createdBy === 'undefined') { stream.createdBy = Defaults.UnknownAccessId; }
  if (typeof stream.modifiedBy === 'undefined') { stream.modifiedBy = Defaults.UnknownAccessId; }
  if (stream.children == null) { stream.children = []; }
  if (stream.children.length > 0) { applyOnStreams(stream.children, stream.id); }
  stream.parentId = parentId;
}

/**
 * Adds missing mandatory properties to the given streams and their children (if present).
 * **Note**: mutates the stream objects.
 * @param {Object[]} streams
 * @param {[string]} parentId  - for parentId of the stream
 */
function applyOnStreams (streams, parentId = null) {
  streams.forEach(stream => applyOnStream(stream, parentId));
}
