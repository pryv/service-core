/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const converters = require('./converters');

module.exports = ApplyEventsFromDbStream;

inherits(ApplyEventsFromDbStream, Transform);

/**
 * @param {Array<Function>} convs
 */
function ApplyEventsFromDbStream (itemFromDBConverters) {
  Transform.call(this, { objectMode: true });
  this.trans = converters.getRenamePropertyFn('_id', 'id');
  this.converters = itemFromDBConverters;
}

ApplyEventsFromDbStream.prototype._transform = function (event, encoding, callback) {
  try {
    event = this.trans(event);
    // SingleCollectionsMode - start
    delete event.userId;

    for (const converter of this.converters) {
      event = converter(event);
    }

    this.push(event);
    callback();
  } catch (err) {
    return callback(err);
  }
};
