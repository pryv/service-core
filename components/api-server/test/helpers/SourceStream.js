/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Readable = require('stream').Readable,
      inherits = require('util').inherits,
      _ = require('lodash');

module.exports = Source;

/**
 * Readable stream outputing the objects of the array passed in parameters
 *
 * @param array
 * @constructor
 */
function Source(array) {
  Readable.call(this, {objectMode: true, highWaterMark: 1});
  this.array = _.cloneDeep(array); // shift changes in place
}

inherits(Source, Readable);

Source.prototype._read = function () {
  if (!this.array || this.array.length === 0) {
    this.push(null);
  }
  else {
    var reading = this.array.shift();
    this.push(reading);
  }
};
