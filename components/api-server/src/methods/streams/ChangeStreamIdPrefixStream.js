/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const { changeMultipleStreamIdsPrefix } = require('../helpers/retroCompatibility');

module.exports = ChangeStreamIdPrefixStream;

/**
 * For retrocompatibility, change system stream id prefix
 * This needs to be run before "SetSingleStreamIdStream.js"
 * @constructor
 */
function ChangeStreamIdPrefixStream() {
  Transform.call(this, {objectMode: true});
}

inherits(ChangeStreamIdPrefixStream, Transform);

ChangeStreamIdPrefixStream.prototype._transform = function (event, encoding, callback) {
  event.streamIds = changeMultipleStreamIdsPrefix(event.streamIds);
  this.push(event);
  callback();
};
