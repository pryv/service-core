var Readable = require('stream').Readable,
    inherits = require('util').inherits,
    R = require('ramda');

module.exports = Source;

/**
 * Readable stream outputing the objects of the array passed in parameters
 *
 * @param array
 * @constructor
 */
function Source(array) {
  Readable.call(this, {objectMode: true});
  this.array = R.clone(array); // shift changes in place
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