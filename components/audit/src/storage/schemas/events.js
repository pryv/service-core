/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const _ = require('lodash');
const ALL_EVENTS_TAG = '..';

// new schema for events
// - renamed duration to endTime
// - added deleted
// - added attachments
// changed most of the fields to be nullable
// - added headId


const dbSchema = { 
  eventid : {type: 'TEXT UNIQUE', index: true},
  headId : {type: 'TEXT'},
  streamIds: {type: 'TEXT'},
  time: {type: 'REAL', index: true},
  deleted: {type: 'REAL', index: true},
  endTime: {type: 'REAL', index: true},
  type: {type: 'TEXT', index: true},
  content: {type: 'TEXT'},
  description: {type: 'TEXT'},
  clientData: {type: 'TEXT'},
  integrity: {type: 'TEXT'},
  attachments: {type: 'TEXT'},
  trashed: {type: 'INTEGER DEFAULT 0', index: true},
  created: {type: 'REAL', index: true},
  createdBy: {type: 'TEXT', index: true},
  modified: {type: 'READ', index: true},
  modifiedBy: {type: 'TEXT', index: true}
}

/**
 * 
 * @param {Object} event -- An event object
 * @param {Number} defaulTime -- The defaut time to use for 'time, created and modified'
 */
function eventToDB(sourceEvent, defaulTime) {
  const event = {};
  defaulTime = setTimeIfNot(defaulTime, now());
  event.eventid = sourceEvent.id || cuid();

  if (sourceEvent.streamIds == null) {
    event.streamIds = ALL_EVENTS_TAG;
  } else {
    if (! Array.isArray(sourceEvent.streamIds)) throw('StreamIds must be an Array');
    event.streamIds = sourceEvent.streamIds.join(' ') + ' ' + ALL_EVENTS_TAG;
  }

  event.time = setTimeIfNot(sourceEvent.time, defaulTime);

  event.endTime = nullIfUndefined(sourceEvent.endTime);
  event.deleted = nullIfUndefined(sourceEvent.deleted);
  event.integrity = nullIfUndefined(sourceEvent.integrity);
  event.headId = nullIfUndefined(sourceEvent.headId);

  event.type = nullIfUndefined(sourceEvent.type);
  
  event.content = nullOrJSON(sourceEvent.content);
  
  event.description = nullIfUndefined(sourceEvent.description);
  event.created = setTimeIfNot(sourceEvent.created, defaulTime);
  event.clientData = nullOrJSON(sourceEvent.clientData);
  event.attachments = nullOrJSON(sourceEvent.attachments);
  event.trashed = (sourceEvent.trashed) ? 1 : 0;

  event.createdBy =  nullIfUndefined(sourceEvent.createdBy);
  event.modifiedBy = sourceEvent.modifiedBy || sourceEvent.createdBy;
  event.modified = setTimeIfNot(sourceEvent.modified, defaulTime);;
  return event;
};

function nullIfUndefined(value) {
  return  (typeof value != 'undefined') ? value : null ;
}

function nullOrJSON(value) {
  if (typeof value == null) return null ;
  return JSON.stringify(value);
}

/**
 * transform events out of db
 */
function eventFromDB(event, addStorePrefix = false) {
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

  if (event.content) {
    event.content = JSON.parse(event.content);
  }

  if (event.attachments) {
    event.attachments = JSON.parse(event.attachments);
  } else {
    event.attachments = [];
  }

  for (key of Object.keys(event)) {
    if (event[key] == null) delete event[key];
  }
  return event;
}


module.exports = {
  eventToDB : eventToDB,
  eventFromDB: eventFromDB,
  dbSchema: dbSchema
}


function setTimeIfNot(time, defaultNow) {
  if (typeof time === 'undefined' ||time === null) {
    return defaultNow;
  }
  return time;
}

function now() {
  return Date.now() / 1000;
}