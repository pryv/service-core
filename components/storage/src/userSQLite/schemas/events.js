/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ALL_EVENTS_TAG = '..';

const dbSchema = {
  eventid: { type: 'TEXT UNIQUE', index: true, coerce: 'txt' },
  headId: { type: 'TEXT DEFAULT NULL', coerce: 'txt' },
  streamIds: { type: 'TEXT', coerce: 'txt' },
  time: { type: 'REAL', index: true, coerce: 'num' },
  deleted: { type: 'REAL DEFAULT NULL', index: true, coerce: 'num' },
  endTime: { type: 'REAL', index: true, coerce: 'num' },
  type: { type: 'TEXT', index: true, coerce: 'txt' },
  content: { type: 'TEXT', coerce: 'txt' },
  description: { type: 'TEXT', coerce: 'txt' },
  clientData: { type: 'TEXT', coerce: 'txt' },
  integrity: { type: 'TEXT', coerce: 'txt' },
  attachments: { type: 'TEXT', coerce: 'txt' },
  trashed: { type: 'INTEGER DEFAULT 0', index: true, coerce: 'bool' },
  created: { type: 'REAL', index: true, coerce: 'num' },
  createdBy: { type: 'TEXT', index: true, coerce: 'txt' },
  modified: { type: 'REAL', index: true, coerce: 'num' },
  modifiedBy: { type: 'TEXT', index: true, coerce: 'txt' }
};

/**
 * @param {Object} event -- An event object
 */
function eventToDB (sourceEvent) {
  const event = {};
  event.eventid = sourceEvent.id;

  if (sourceEvent.streamIds == null) {
    event.streamIds = ALL_EVENTS_TAG;
  } else {
    if (!Array.isArray(sourceEvent.streamIds)) throw new Error('streamIds must be an Array');
    event.streamIds = sourceEvent.streamIds.join(' ') + ' ' + ALL_EVENTS_TAG;
  }

  event.time = nullIfUndefined(sourceEvent.time);

  event.endTime = nullIfUndefined(sourceEvent.endTime);
  event.deleted = nullIfUndefined(sourceEvent.deleted);
  event.integrity = nullIfUndefined(sourceEvent.integrity);
  event.headId = nullIfUndefined(sourceEvent.headId);

  event.type = nullIfUndefined(sourceEvent.type);

  event.content = nullOrJSON(sourceEvent.content);

  event.description = nullIfUndefined(sourceEvent.description);
  event.created = nullIfUndefined(sourceEvent.created);
  event.clientData = nullOrJSON(sourceEvent.clientData);
  event.attachments = nullOrJSON(sourceEvent.attachments);
  if (sourceEvent.deleted != null || sourceEvent.trashed != null) {
    event.trashed = (sourceEvent.trashed) ? 1 : 0;
  } else {
    event.trashed = null;
  }

  event.createdBy = nullIfUndefined(sourceEvent.createdBy);
  event.modifiedBy = nullIfUndefined(sourceEvent.modifiedBy);
  event.modified = nullIfUndefined(sourceEvent.modified);
  return event;
}

function nullIfUndefined (value) {
  return (typeof value !== 'undefined') ? value : null;
}

function nullOrJSON (value) {
  if (typeof value === 'undefined' || value === null) return null;
  return JSON.stringify(value);
}

/**
 * transform events out of db
 */
function eventFromDB (event, addStorePrefix = false) {
  event.streamIds = event.streamIds.split(' ');
  event.streamIds.pop(); // pop removes the last element whihc is set on all events ALL_EVENTS_TAG
  if (event.streamIds.length === 0) delete event.streamIds; // it was a "deleted" event

  event.id = event.eventid;
  delete event.eventid;

  if (event.trashed === 1) {
    event.trashed = true;
  } else {
    delete event.trashed; // don't return it to API if false
  }

  if (event.content != null) {
    event.content = JSON.parse(event.content);
  }

  if (event.attachments != null) {
    event.attachments = JSON.parse(event.attachments);
  }

  if (event.clientData != null) {
    event.clientData = JSON.parse(event.clientData);
  }

  for (const key of Object.keys(event)) {
    // delete all "null" fields but "duration" which mean "running".
    if (key !== 'endTime' && event[key] == null) delete event[key];
  }
  return event;
}

/**
 * - Add eventual '' to values that are not of type "REAL" and escape eventual '
 * - Transform booleans to 0/1
 * - Check that numbers are numbers
 * Does not handle "null" values
 * @param {*} column
 * @param {*} value
 */
function coerceSelectValueForCollumn (column, value) {
  return coerces[dbSchema[column].coerce](value);
}

const coerces = {
  txt: (value) => { return "'" + (value + '').replaceAll("'", "\\'") + "'"; },
  num: (value) => { return (typeof value === 'number') ? value : parseFloat(value); },
  bool: (value) => { return value ? 1 : 0; }
};

module.exports = {
  eventToDB,
  eventFromDB,
  dbSchema,
  coerceSelectValueForCollumn,
  ALL_EVENTS_TAG
};
