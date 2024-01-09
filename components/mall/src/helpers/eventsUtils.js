/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const storeDataUtils = require('./storeDataUtils');
const errorFactory = require('errors').factory;
// ------------  Duration -----------//
/**
 * @returns {any}
 */
function durationToStoreEndTime (eventData) {
  if (eventData.time == null) {
    delete eventData.duration;
    return eventData;
  } // deleted event
  if (eventData.duration === null) {
    // exactly null
    eventData.endTime = null;
  } else if (eventData.duration === undefined) {
    // (no undefined)
    // event.time is not defined for deleted events
    eventData.endTime = eventData.time;
  } else {
    // defined
    eventData.endTime = eventData.time + eventData.duration;
  }
  delete eventData.duration;
  return eventData;
}
/**
 * @returns {any}
 */
function endTimeFromStoreToDuration (eventData) {
  if (eventData.time == null) {
    delete eventData.endTime;
    return eventData;
  } // deleted event
  if (eventData.endTime === null) {
    eventData.duration = null;
  } else if (eventData.endTime !== undefined) {
    const prevDuration = eventData.duration;
    eventData.duration = eventData.endTime - eventData.time;
    if (prevDuration != null && prevDuration !== eventData.duration) {
      console.log('What !! ', new Error('Duration issue.. This should not thappen'));
    }
  }
  delete eventData.endTime;
  // force duration property undefined if 0
  if (eventData.duration === 0) {
    delete eventData.duration;
  }
  return eventData;
}
// state
/**
 * @returns {any}
 */
function stateToStore (eventData) {
  eventData.trashed = eventData.trashed === true;
  return eventData;
}
/**
 * @returns {any}
 */
function stateFromStore (eventData) {
  if (eventData.trashed !== true) { delete eventData.trashed; }
  return eventData;
}
// ---------  deletion ------ //
/**
 * @returns {any}
 */
function deletionToStore (eventData) {
  if (eventData.deleted === undefined) {
    // undefined => null
    eventData.deleted = null;
  }
  return eventData;
}
/**
 * @returns {any}
 */
function deletionFromStore (eventData) {
  if (eventData == null) {
    return eventData;
  }
  if (eventData.deleted == null) {
    // undefined or null
    delete eventData.deleted;
  }
  return eventData;
}
// ----------- All events fields ------- //
const ALL_FIELDS = [
  'streamIds',
  'time',
  'endTime',
  'type',
  'content',
  'description',
  'attachments',
  'clientData',
  'trashed',
  'created',
  'createdBy',
  'modified',
  'modifiedBy',
  'integrity'
];
/**
 * set to null all undefined fields
 * @returns {any}
 */
function nullifyToStore (eventData) {
  for (const field of ALL_FIELDS) {
    if (eventData[field] === undefined) {
      eventData[field] = null;
    }
  }
  return eventData;
}
/**
 * @returns {any}
 */
function nullifyFromStore (eventData) {
  for (const field of ALL_FIELDS) {
    if (eventData[field] === null && field !== 'endTime') {
      delete eventData[field];
    }
  }
  return eventData;
}
// ------------ storeId ------------- //
/**
 * @returns {any}
 */
function removeStoreIds (storeId, eventData) {
  const original = structuredClone(eventData);
  const [eventStoreId, storeEventId] = storeDataUtils.parseStoreIdAndStoreItemId(eventData.id);
  if (eventStoreId !== storeId) {
    throw errorFactory.invalidRequestStructure('Cannot create or update an event with id and streamIds belonging to different stores', original);
  }
  eventData.id = storeEventId;
  // cleanup storeId from streamId
  if (eventData.streamIds != null) {
    // it might happen that deleted is set but streamIds is not when loading test data
    for (let i = 0; i < eventData.streamIds.length; i++) {
      // check that the event belongs to a single store.
      const [testStoreId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(eventData.streamIds[i]);
      if (storeId == null) {
        storeId = testStoreId;
      } else if (testStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('Cannot create or update an event with id and streamIds belonging to different stores', original);
      }
      eventData.streamIds[i] = storeStreamId;
    }
  }
  return eventData;
}
/**
 * @returns {any}
 */
function addStoreId (storeId, eventData) {
  eventData.id = storeDataUtils.getFullItemId(storeId, eventData.id);
  if (eventData.streamIds) {
    eventData.streamIds = eventData.streamIds.map(storeDataUtils.getFullItemId.bind(null, storeId));
  }
  return eventData;
}
/**
 * @returns {any}
 */
function removeEmptyAttachments (eventData) {
  if (eventData?.attachments != null && eventData.attachments.length === 0) {
    delete eventData.attachments;
  }
  return eventData;
}
// ------------- pack ----------------//
/**
 * @returns {any}
 */
function convertEventToStore (storeId, eventData) {
  const event = structuredClone(eventData);
  removeStoreIds(storeId, event);
  durationToStoreEndTime(event);
  stateToStore(event);
  deletionToStore(event);
  nullifyToStore(event);
  return event;
}
/**
 * @returns {any}
 */
function convertEventFromStore (storeId, eventData) {
  const event = structuredClone(eventData);
  endTimeFromStoreToDuration(event);
  stateFromStore(event);
  deletionFromStore(event);
  removeEmptyAttachments(event);
  addStoreId(storeId, event);
  nullifyFromStore(event);
  return event;
}
/** @extends Transform */
class ConvertEventFromStoreStream extends Transform {
  storeId;
  constructor (storeId) {
    super({ objectMode: true });
    this.storeId = storeId;
  }

  /**
   * @default function (event, encoding, callback) {
   *     this.push(convertEventFromStore(this.storeId, event));
   *     callback();
   *   }
   */
  _transform = function (event, encoding, callback) {
    this.push(convertEventFromStore(this.storeId, event));
    callback();
  };
}
module.exports = {
  convertEventToStore,
  convertEventFromStore,
  ConvertEventFromStoreStream
};
