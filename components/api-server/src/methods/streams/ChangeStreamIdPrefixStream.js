/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const { convertStreamIdsToOldPrefixOnResult } = require('../helpers/backwardCompatibility');

module.exports = ChangeStreamIdPrefixStream;

/**
 * For backwardCompatibility, change system stream id prefix
 * This needs to be run before "SetSingleStreamIdStream.js"
 * @constructor
 */
function ChangeStreamIdPrefixStream () {
  Transform.call(this, { objectMode: true });
}

inherits(ChangeStreamIdPrefixStream, Transform);

ChangeStreamIdPrefixStream.prototype._transform = function (event, encoding, callback) {
  convertStreamIdsToOldPrefixOnResult(event);
  this.push(event);
  callback();
};
