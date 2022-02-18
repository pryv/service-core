/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const _ = require('lodash');
const Transform = require('stream').Transform;
const StreamsUtils = require('./StreamsUtils');
const errorFactory = require('errors').factory;

// ------------  Duration -----------// 

function durationToStoreEndTime (eventData) {
  if (eventData.time == null) {delete eventData.duration; return eventData; }// deleted event 

  if (eventData.duration === null) { // exactly null 
    eventData.endTime = null;
  } else if (eventData.duration === undefined) { // (no undefined)
    // event.time is not defined for deleted events
    eventData.endTime = eventData.time;
  } else { // defined
    
    eventData.endTime = eventData.time + eventData.duration;
  }
  delete eventData.duration;
  return eventData;
}

function endTimeFromStoreToDuration (eventData) {
  if (eventData.time == null) { delete eventData.endTime; return eventData; }// deleted event 

  if (eventData.endTime === null) {
    eventData.duration = null;
  } else if (eventData.endTime !== undefined) {
    const prevDuration = eventData.duration;
    eventData.duration = eventData.endTime - eventData.time;
    if (prevDuration != null && prevDuration != eventData.duration) {
      console.log('What !! ', new Error('Duration issue.. This should not thappen'));
    }
  } 
  delete eventData.endTime;
  // force duration property undefined if 0
  if (eventData.duration === 0) { delete eventData.duration; }
  return eventData;
}

// state

function stateToStore(eventData) {
  if (eventData.delete !== undefined) {
    delete eventData.trashed;
  } else {
    eventData.trashed = (eventData.trashed === true);
  }
  return eventData;
};

function stateFromStore(eventData) {
  if (eventData.trashed !== true) delete eventData.trashed;
  return eventData;
};

// ---------  deletion ------ // 

function deletionToStore (eventData) {
  if (eventData.deleted === undefined) { // undefined => null 
    eventData.deleted = null;
  }
  return eventData;
};

function deletionFromStore (eventData) {
  if (eventData == null) { return eventData; }

  if (eventData.deleted == null) { // undefined or null
    delete eventData.deleted;
  }
  return eventData;
};


// ------------ storeId ------------- //


function removeStoreIds(storeId, eventData) {
  const [eventStoreId, eventId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.id);
  if (eventStoreId !== storeId) {
    throw errorFactory.invalidRequestStructure('Cannot create event with id and streamIds belonging to different stores', eventData);
  }
  eventData.id = eventId;

  // cleanup storeId from streamId
  if (eventData.streamIds != null) { // it might happen that deleted is set but streamIds is not when loading test data
    for (let i = 0; i < eventData.streamIds.length; i++) {
      // check that the event belongs to a single store.
      const [testStoreId, streamId] = StreamsUtils.storeIdAndStreamIdForStreamId(eventData.streamIds[i]);
      if (storeId == null) { storeId = testStoreId; }
      else if (testStoreId !== storeId) {
        throw errorFactory.invalidRequestStructure('Cannot create event with id and streamIds belonging to different stores', eventData);
      }
      eventData.streamIds[i] = streamId;
    }
  }
  return eventData;
}

function addStoreId(storeId, eventData) {
  if (storeId === 'local') return eventData;
  const storePrefix = ':' + storeId + ':';
  eventData.id = storePrefix + eventData.id;
  if (eventData.streamIds != null) {
   eventData.streamIds = eventData.streamIds.map(streamId => storePrefix +streamId);
  }
  return eventData;
}

function removeEmptyAttachments(eventData) {
  if (eventData?.attachments != null && eventData.attachments.length == 0) { 
    delete eventData.attachments; 
  }


  return eventData;
}


// ------------- pack ----------------//

function convertEventToStore(storeId, eventData) {
  const event = _.cloneDeep(eventData);
  removeStoreIds(storeId, event);
  durationToStoreEndTime(event);
  stateToStore(event);
  deletionToStore(event);
  return event;
}

function convertEventFromStore(storeId, eventData) {
  const event = _.cloneDeep(eventData);
  endTimeFromStoreToDuration(event);
  stateFromStore(event);
  deletionFromStore(event);
  removeEmptyAttachments(event);
  addStoreId(storeId, event);
  return event;
}



class ConvertEventFromStoreStream extends Transform {
  storeId : string;
  constructor(storeId) {
    super({objectMode: true});
    this.storeId = storeId;
  }
  _transform = function (event, encoding, callback) {
    this.push(convertEventFromStore(this.storeId, event));
    callback();
  };
}

module.exports = {
  convertEventToStore,
  convertEventFromStore,
  ConvertEventFromStoreStream,
}