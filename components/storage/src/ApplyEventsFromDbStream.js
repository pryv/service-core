/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters'),
    timestamp = require('unix-timestamp');

module.exports = ApplyEventsFromDbStream;

inherits(ApplyEventsFromDbStream, Transform);

/**
 * @param {Array<Function>} convs 
 */
function ApplyEventsFromDbStream(itemFromDBConverters) {
  Transform.call(this, {objectMode: true});
  this.trans = converters.getRenamePropertyFn('_id', 'id');
  this.converters = itemFromDBConverters;
}

ApplyEventsFromDbStream.prototype._transform = function (event, encoding, callback) {
  try {
    event = this.trans(event);
    // SingleCollectionsMode - start
    delete event.userId;

    for (converter of this.converters) {
      event = converter(event);
    }

    this.push(event);
    callback();
  } catch(err) {
    return callback(err);
  }
};