var Transform = require('stream').Transform,
  inherits = require('util').inherits;

module.exports = ArrayStream;

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
  this.size = 1000;
  this.count = 0;
  this.stack = [];
}

inherits(ArrayStream, Transform);

ArrayStream.prototype._transform = function (item, encoding, callback) {

  this.stack.push(item);
  this.count++;
  if (this.count > this.size) {
    this.count = 0;
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
  if ((this.stack.length > 0) && (this.isStart)) {
    this.push(this.prefix + JSON.stringify(this.stack));
  } else if (this.stack.length > 0 && (! this.isStart)) {
    this.push(',' + (JSON.stringify(this.stack)).slice(1));
  } else {
    this.push(']');
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