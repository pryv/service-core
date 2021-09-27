/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const { findTagsInStreamIds } = require('../helpers/backwardCompatibility');

module.exports = ChangeStreamIdPrefixStream;

/**
 * For backwardCompatibility, change system stream id prefix
 * This needs to be run before "SetSingleStreamIdStream.js"
 * @constructor
 */
function AddTagsStream() {
  Transform.call(this, {objectMode: true});
}

inherits(AddTagsStream, Transform);

AddTagsStream.prototype._transform = function (event, encoding, callback) {
  event.tags = findTagsInStreamIds(event.streamIds);
  this.push(event);
  callback();
};
