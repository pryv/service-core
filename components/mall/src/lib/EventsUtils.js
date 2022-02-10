/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const _ = require('lodash');
const Transform = require('stream').Transform;

function durationToEndTime (eventData) {
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

function endTimeToDuration (eventData) {
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

function stateForStore(item) {
  item.trashed = (item.trashed === true);
  return item;
};

function stateFromStore(item) {
  if (item.trashed !== true) delete item.trashed;
  return item;
};



function convertEventForStore(eventData) {
  const event = _.cloneDeep(eventData);
  durationToEndTime(event);
  stateForStore(event);
  return event;
}

function convertEventFromStore(eventData) {
  const event = _.cloneDeep(eventData);
  endTimeToDuration(event);
  stateFromStore(event);
  return event;
}

class ConvertEventFromStoreStream extends Transform {
  constructor() {
    super({objectMode: true});
  }
  _transform = function (event, encoding, callback) {
    this.push(convertEventFromStore(event));
    callback();
  };
}

module.exports = {
  convertEventForStore,
  convertEventFromStore,
  ConvertEventFromStoreStream,
}