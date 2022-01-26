/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * @property {timestamp} UNKNOWN_DATE - Unknown creation / modification date
 * @property {string} BY_SYSTEM - When createdBy / modifiedBy value is SYSTEM
 * @property {string} BY_UNKNOWN - When createdBy / modifiedBy value is UNKNOWN
 * @property {string} BY_EXTERNAL_PREFIX - When createdBy / modifiedBy value is an external Reference
 */
const Defaults = module.exports = {
  UNKNOWN_DATE: 10000000.00000001,
  BY_SYSTEM: 'system',
  BY_UNKNOWN: 'unknown',
  BY_EXTERNAL_PREFIX: 'external-',
  applyOnEvent,
  applyOnEvents,
  applyOnStream,
  applyOnStreams
};


/**
 * Adds missing mandatory properties to the given event.
 * **Note**: event object will be modified
 * @property {Event} event
 * @returns null;
 */
function applyOnEvent(event: Event) {
  if (typeof event.created === 'undefined') event.created = Defaults.UNKNOWN_DATE;
  if (typeof event.modified === 'undefined') event.modified = Defaults.UNKNOWN_DATE;
  if (typeof event.createdBy === 'undefined') event.createdBy = Defaults.BY_UNKNOWN;
  if (typeof event.modifiedBy === 'undefined') event.modifiedBy = Defaults.BY_UNKNOWN;
}

function applyOnEvents(events: Array<Event>) {
  events.forEach(Defaults.applyOnEvent);
}

/**
 * Adds missing mandatory properties to the given stream and its children (if present).
 * **Note**: stream object will be modified
 * @param {Stream} stream
 * @param {[string]} parentId  - for parentId of the stream
 */
function applyOnStream(stream: Stream, parentId: ?string): void {
  if (typeof stream.created === 'undefined') stream.created = Defaults.UNKNOWN_DATE;
  if (typeof stream.modified === 'undefined') stream.modified = Defaults.UNKNOWN_DATE;
  if (typeof stream.createdBy === 'undefined') stream.createdBy = Defaults.BY_UNKNOWN;
  if (typeof stream.modifiedBy === 'undefined') stream.modifiedBy = Defaults.BY_UNKNOWN;
  if (stream.children == null) stream.children = [];
  if (stream.children.length > 0) Defaults.applyOnStreams(stream.children, stream.id);
  // force parentId
  stream.parentId = parentId || null;
}

/**
 * Utility to complete streams properties with missing properties
 * @param {Array<Streams>} streams
 */
function applyOnStreams(streams: Array<Stream>, parentId: ?string): void {
  streams.forEach(stream => Defaults.applyOnStream(stream, parentId));
}
