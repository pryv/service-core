/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var Transform = require('stream').Transform,
    inherits = require('util').inherits,
  utils = require('utils');

module.exports = SetSingleStreamIdStream;

/**
 * For retrocompatibility set single StreamId to Event
 * @constructor
 */
function SetSingleStreamIdStream(params) {
  Transform.call(this, {objectMode: true});
}

inherits(SetSingleStreamIdStream, Transform);

SetSingleStreamIdStream.prototype._transform = function (event, encoding, callback) {
  event.streamId = event.streamIds[0];
  this.push(event);
  callback();
};

