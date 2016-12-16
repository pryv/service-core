var Transform = require('stream').Transform,
  inherits = require('util').inherits;

/**
 * Stream that sends the an array of data with a prefix
 *
 * @param params
 * @constructor
 */
function StringifyStream() {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
}

inherits(StringifyStream, Transform);

StringifyStream.prototype._transform = function (event, encoding, callback) {


  if (this.isStart) {
    this.push('[' + JSON.stringify(event));
    this.isStart = false;
  } else {
    this.push(',' + JSON.stringify(event));
  }
  callback();
};

StringifyStream.prototype._flush = function (callback) {
  this.push(']');
  callback();
};

module.exports = StringifyStream;