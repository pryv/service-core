const { Readable } = require('stream');
const { inherits } = require('util');
const R = require('ramda');

module.exports = Source;

/**
 * Readable stream outputing the objects of the array passed in parameters
 *
 * @param array
 * @constructor
 */
function Source(array) {
  Readable.call(this, { objectMode: true });
  this.array = R.clone(array); // shift changes in place
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
