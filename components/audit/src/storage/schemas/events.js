/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const _ = require('lodash');
const { STORE_PREFIX } = require('../../Constants');

// new schema for events
// - renamed duration to endTime
// - added deleted
// - added attachments
// changed most of the fields to be nullable


const dbSchema = { 
  eventid : {type: 'TEXT UNIQUE', index: true},
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

  if (! sourceEvent.streamIds) throw('StreamIds is required');
  if (! Array.isArray(sourceEvent.streamIds)) throw('StreamIds must be an Array');
  event.streamIds = sourceEvent.streamIds.join(' ');

  event.time = setTimeIfNot(sourceEvent.time, defaulTime);

  event.endTime = nullIfUndefined(sourceEvent.endTime);
  event.deleted = nullIfUndefined(sourceEvent.deleted);
  event.integrity = nullIfUndefined(sourceEvent.integrity);

  if (! sourceEvent.type) throw('Type is required');
  event.type = sourceEvent.type;
  
  event.content = nullOrJSON(sourceEvent.content);
  
  event.description = nullIfUndefined(sourceEvent.description);
  event.created = setTimeIfNot(sourceEvent.created, defaulTime);
  event.clientData = nullOrJSON(sourceEvent.clientData);
  event.attachments = nullOrJSON(sourceEvent.attachments);
  event.trashed = (sourceEvent.trashed) ? 1 : 0;

  if (sourceEvent.createdBy == null) throw('CreatedBy is required');
  event.createdBy = sourceEvent.createdBy;
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

function addStorePrefixToId(streamId) {
  return STORE_PREFIX + streamId;
}

/**
 * transform events out of db
 */
function eventFromDB(event, addStorePrefix) {
  event.streamIds = event.streamIds.split(' ');

  if (addStorePrefix) {
    event.id = addStorePrefixToId(event.eventid);
    event.streamIds = event.streamIds.map(addStorePrefixToId);
  } else {
    event.id = event.eventid;
  }
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