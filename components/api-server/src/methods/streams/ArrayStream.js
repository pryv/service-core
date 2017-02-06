var Transform = require('stream').Transform,
  inherits = require('util').inherits;

module.exports = ArrayStream;

/**
 * Stream that sends an array of data, stringified.
 *
 * @param result    {Object} Result for the API request
 * @param arrayName {String} array name that will prefix the array
 * @constructor
 */
function ArrayStream(result,  arrayName) {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
  this.prefix = result.formatPrefix(arrayName);
  result.addStream(this);
}

inherits(ArrayStream, Transform);

ArrayStream.prototype._transform = function (event, encoding, callback) {
  if (this.isStart) {
    this.push(this.prefix + '[' + JSON.stringify(event));
    this.isStart = false;
  } else {
    this.push(',' + JSON.stringify(event));
  }
  callback();
};

ArrayStream.prototype._flush = function (callback) {
  this.push(']');
  callback();
};