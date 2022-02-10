/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const _ = require('lodash');
const Transform = require('stream').Transform;

function durationToEndTime (eventData) {
  if (eventData.endTime !== undefined) {
    //console.log('endTime should no be defined ', {id: eventData.id, endTime: eventData.endTime, duration: eventData.duration});
    return eventData;
  }
  if (eventData.duration === null) { // exactly null 
    eventData.endTime = null;
  } else if (eventData.duration === undefined) { // (no undefined)
    // event.time is not defined for deleted events
    if (eventData.time != null) eventData.endTime = eventData.time;
  } else { // defined
    eventData.endTime = eventData.time + eventData.duration;
  }
  delete eventData.duration;
  return eventData;
}

function endTimeToDuration (event) {
  if (event == null) {
    return event;
  }
  if (event.endTime === null) {
    event.duration = null;
  } else if (event.endTime !== undefined) {
    const prevDuration = event.duration;
    event.duration = event.endTime - event.time;
    if (prevDuration != null && prevDuration != event.duration) {
      console.log('What !! ', new Error('Duration issue.. This should not thappen'));
    }
  } 
  delete event.endTime;
  // force duration property undefined if 0
  if (event.duration === 0) { delete event.duration; }
  return event;
}

function convertEventForStore(eventData) {
  const event = _.cloneDeep(eventData);
  durationToEndTime(event);
  return event;
}

function convertEventFromStore(eventData) {
  const event = _.cloneDeep(eventData);
  endTimeToDuration(event);
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