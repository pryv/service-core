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
}

inherits(ArrayStream, Transform);

ArrayStream.prototype._transform = function (item, encoding, callback) {
  if (this.isStart) {
    this.push(this.prefix + '[' + JSON.stringify(item));
    this.isStart = false;
  } else {
    this.push(',' + JSON.stringify(item));
  }
  callback();
};

ArrayStream.prototype._flush = function (callback) {
  this.push(']');
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