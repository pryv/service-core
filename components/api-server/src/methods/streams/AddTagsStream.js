/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const { putOldTags } = require('../helpers/backwardCompatibility');

module.exports = AddTagsStream;

/**
 * For backwardCompatibility, change system stream id prefix
 * This needs to be run before "SetSingleStreamIdStream.js"
 * @constructor
 */
function AddTagsStream() {
  Transform.call(this, {objectMode: true, highWaterMark: 4000});
}

inherits(AddTagsStream, Transform);

AddTagsStream.prototype._transform = function (event, encoding, callback) {
  event = putOldTags(event);
  this.push(event);
  callback();
};
