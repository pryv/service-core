/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Readable = require('stream').Readable;
const inherits = require('util').inherits;

module.exports = Source;

/**
 * Readable stream outputing the objects of the array passed in parameters
 *
 * @param array
 * @constructor
 */
function Source (array) {
  Readable.call(this, { objectMode: true });
  this.array = structuredClone(array); // shift changes in place
}

inherits(Source, Readable);

Source.prototype._read = function () {
  if (!this.array || this.array.length === 0) {
    this.push(null);
  } else {
    const reading = this.array.shift();
    this.push(reading);
  }
};
