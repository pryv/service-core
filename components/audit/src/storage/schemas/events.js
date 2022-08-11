/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const _ = require('lodash');
const { STORE_PREFIX } = require('../../Constants');


const dbSchema = { 
  eventid : {type: 'TEXT UNIQUE', index: true},
  streamIds: {type: 'TEXT NOT NULL'},
  time: {type: 'REAL NOT NULL', index: true},
  duration: {type: 'REAL'},
  type: {type: 'TEXT NOT NULL', index: true},
  content: {type: 'TEXT'},
  description: {type: 'TEXT'},
  clientData: {type: 'TEXT'},
  trashed: {type: 'INTEGER DEFAULT 0', index: true},
  created: {type: 'REAL NOT NULL', index: true},
  createdBy: {type: 'TEXT NOT NULL', index: true},
  modified: {type: 'READ NOT NULL', index: true},
  modifiedBy: {type: 'TEXT NOT NULL', index: true}
}

/**
 * 
 * @param {Object} event -- An event object
 * @param {Number} defaulTime -- The defaut time to use for 'time, created and modified'
 */
function eventToDB(sourceEvent, defaulTime) {
  const event = {};
  defaulTime = setTimeIfNot(defaulTime, now());
  event.eventid = sourceEvent.id || cuid();

  if (! sourceEvent.streamIds) throw('StreamIds is required');
  if (! Array.isArray(sourceEvent.streamIds)) throw('StreamIds must be an Array');
  event.streamIds = sourceEvent.streamIds.join(' ');

  event.time = setTimeIfNot(sourceEvent.time, defaulTime);

  event.duration = 0; // Anyway no duration for audit setTimeIfNot(sourceEvent.endTime);

  if (! sourceEvent.type) throw('Type is required');
  event.type = sourceEvent.type;
  
  event.content = (typeof sourceEvent.content != 'undefined') ? JSON.stringify(sourceEvent.content) : null;
  
  event.description = nullIfUndefined(sourceEvent.description);
  event.created = defaulTime;
  event.clientData = nullIfUndefined(sourceEvent.clientData);
  event.trashed = (sourceEvent.trashed) ? 1 : 0;

  if (! sourceEvent.createdBy) throw('CreatedBy is required');
  event.createdBy = sourceEvent.createdBy;

  event.modified = defaulTime;
  if (! sourceEvent.modifiedBy) event.modifiedBy = sourceEvent.createdBy;
  return event;
};

function nullIfUndefined(value) {
  return  (typeof value != 'undefined') ? value : null ;
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

  for (key of Object.keys(event)) {
    if (event[key] == null) delete event[key];
  }

  // duration endTime hack 
  delete event.duration;
  event.endTime = event.time;

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