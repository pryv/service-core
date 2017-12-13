var Transform = require('stream').Transform,
  inherits = require('util').inherits;

module.exports = ArrayStream;

var SERIALIZATION_STACK_SIZE = 1000;

/**
 * Stream that encapsulates the items it receives in a stringified array.
 *
 * @param result    {Object} Result object for the API request
 * @param arrayName {String} array name that will prefix the array
 * @constructor
 */
function ArrayStream(arrayName, isFirst) {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
  this.prefix = formatPrefix(arrayName, isFirst);
  this.size = SERIALIZATION_STACK_SIZE;
  this.stack = [];
}

inherits(ArrayStream, Transform);

ArrayStream.prototype._transform = function (item, encoding, callback) {

  this.stack.push(item);
  if (this.stack.size == this.size) {
    if (this.isStart) {
      this.isStart = false;
      this.push((this.prefix + JSON.stringify(this.stack)).slice(0,-1));
    } else {
      this.push(',' + (JSON.stringify(this.stack)).slice(1,-1));
    }
    this.stack = [];
  }
  callback();
};

ArrayStream.prototype._flush = function (callback) {
  if (this.isStart) {
    this.push(this.prefix + JSON.stringify(this.stack));
  } else {
    this.push(',' + (JSON.stringify(this.stack)).slice(1));
  }
  callback();
};


/**
 * Formats the prefix in the right way depending on whether it is the first data
 * pushed on the result stream or not.
 *
 * @param prefix
 * @param isFirst
 * @returns {string}
 */
function formatPrefix (prefix, isFirst) {
  if (isFirst) {
    return '"' + prefix + '":';
  }
  return ',"' + prefix + '":';
}