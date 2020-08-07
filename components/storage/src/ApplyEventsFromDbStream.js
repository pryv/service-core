/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters'),
    timestamp = require('unix-timestamp');

module.exports = ApplyEventsFromDbStream;

inherits(ApplyEventsFromDbStream, Transform);

function ApplyEventsFromDbStream() {
  Transform.call(this, {objectMode: true});
  this.trans = converters.getRenamePropertyFn('_id', 'id');
}

ApplyEventsFromDbStream.prototype._transform = function (event, encoding, callback) {
  // remove event values used for enforcing uniqness in database level
  // (the fields are formed "streamId + __unique")
 /* TODO IEVA event = Object.keys(event)
    .filter(key => ! /__unique/.test(key))
    .reduce((obj, key) => {
      obj[key] = event[key];
      return obj;
    }, {});*/
  try {
    event = this.trans(event);
    // from storage/src/user/Events.js
    delete event.endTime;

    // SingleCollectionsMode - start
    delete event.userId;
    
    if (event.deleted == null) {
      delete event.deleted;
    }
    // SingleCollectionsModes - end

    // from storage/src/converters
    if (event.deleted) {
      event.deleted = timestamp.fromDate(event.deleted);
    } 
    
    this.push(event);
    callback();
  } catch(err) {
    return callback(err);
  }
};