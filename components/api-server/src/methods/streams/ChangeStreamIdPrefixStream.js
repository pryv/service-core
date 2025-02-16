/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
