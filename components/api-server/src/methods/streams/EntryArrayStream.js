var Transform = require('stream').Transform,
  inherits = require('util').inherits;

/**
 * Stream that sends the an array of data with a prefix
 *
 * @param params
 * @constructor
 */
function EntryArrayStream(result,  key) {
  Transform.call(this, {objectMode: true});
  this.isStart = true;
  this.prefix = result.getPrefix(key);
  result.addEntryStream(this);
}

inherits(EntryArrayStream, Transform);

EntryArrayStream.prototype._transform = function (event, encoding, callback) {
  if (this.isStart) {
    this.push(this.prefix + '[' + JSON.stringify(event));
    this.isStart = false;
  } else {
    this.push(',' + JSON.stringify(event));
  }
  callback();
};

EntryArrayStream.prototype._flush = function (callback) {
  this.push(']');
  callback();
};

module.exports = EntryArrayStream;