/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;

module.exports = SetSingleStreamIdStream;

/**
 * For backwardCompatibility set single StreamId to Event
 * @constructor
 */
function SetSingleStreamIdStream () {
  Transform.call(this, { objectMode: true });
}

inherits(SetSingleStreamIdStream, Transform);

SetSingleStreamIdStream.prototype._transform = function (event, encoding, callback) {
  event.streamId = event.streamIds[0];
  this.push(event);
  callback();
};
