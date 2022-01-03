/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;

module.exports = SetSingleStreamIdStream;

/**
 * For backwardCompatibility set single StreamId to Event
 * @constructor
 */
function SetSingleStreamIdStream() {
  Transform.call(this, {objectMode: true});
}

inherits(SetSingleStreamIdStream, Transform);

SetSingleStreamIdStream.prototype._transform = function (event, encoding, callback) {
  event.streamId = event.streamIds[0];
  this.push(event);
  callback();
};

