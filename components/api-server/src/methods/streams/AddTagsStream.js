/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
function AddTagsStream () {
  Transform.call(this, { objectMode: true });
}

inherits(AddTagsStream, Transform);

AddTagsStream.prototype._transform = function (event, encoding, callback) {
  event = putOldTags(event);
  this.push(event);
  callback();
};
