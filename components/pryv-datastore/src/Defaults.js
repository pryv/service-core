/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * @property {timestamp} UNKNOWN_DATE - Unknown creation / modification date
 * @property {string} BY_SYSTEM - When createdBy / modifiedBy value is SYSTEM
 * @property {string} BY_UNKNOWN - When createdBy / modifiedBy value is UNKNOWN
 * @property {string} BY_EXTERNAL_PREFIX - When createdBy / modifiedBy value is an external Reference
 */
const Defaults = {
  UNKNOWN_DATE: 10000000.00000001,
  BY_SYSTEM: 'system',
  BY_UNKNOWN: 'unknown',
  BY_EXTERNAL_PREFIX: 'external-'
};


/**
 * Utility to complete a event properties with missing properties and complete streamIds.
 * **Note** events object will be modified
 * @property {Event} event
 * @returns null;
 */
Defaults.applyOnEvent = function applyOnEvent(event: Event) {
  if (typeof event.created === 'undefined') event.created = Defaults.UNKNOWN_DATE;
  if (typeof event.modified === 'undefined') event.modified = Defaults.UNKNOWN_DATE;
  if (typeof event.createdBy === 'undefined') event.createdBy = Defaults.BY_UNKNOWN;
  if (typeof event.modifiedBy === 'undefined') event.modifiedBy = Defaults.BY_UNKNOWN;
}

Defaults.applyOnEvents = function applyOnEvents(events: Array<Event>) {
  events.forEach(Defaults.applyOnEvent);
}

/**
 * Utility to complete a stream properties with missing properties 
 * @param {Stream} stream 
 * @param {[string]} parentId  - for parentId of the stream
 */
Defaults.applyOnStream = function applyOnStream(stream: Stream, parentId: ?string): void {
  if (typeof stream.created === 'undefined') stream.created = Defaults.UNKNOWN_DATE;
  if (typeof stream.modified === 'undefined') stream.modified = Defaults.UNKNOWN_DATE;
  if (typeof stream.createdBy === 'undefined') stream.createdBy = Defaults.BY_UNKNOWN;
  if (typeof stream.modifiedBy === 'undefined') stream.modifiedBy = Defaults.BY_UNKNOWN;
  if (stream.children == null) stream.children = [];
  if (stream.children.length > 0) Defaults.applyOnStreams(stream.children, stream.id);
  // force parentId
  stream.parentId = parentId || null;
}


/**
 * Utility to complete streams properties with missing properties 
 * @param {Array<Streams>} streams
 */
 Defaults.applyOnStreams = function applyOnStreams(streams: Array<Stream>, parentId: ?string): void {
  streams.forEach(stream => Defaults.applyOnStream(stream, parentId));
}


module.exports = Defaults;
