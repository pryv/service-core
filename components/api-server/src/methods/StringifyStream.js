var Transform = require('stream').Transform,
  inherits = require('util').inherits;

/**
 * Stream that sends the an array of data with a prefix
 *
 * @param options
 * @constructor
 */
function StringifyStream(options) {
  Transform.call(this, {objectMode: true});

  this.prefix = options.prefix;
  this.isStart = true;
}

inherits(StringifyStream, Transform);

StringifyStream.prototype._transform = function (event, encoding, callback) {
  //array = [].concat(array);
  console.log('StringifyStream: got', event);
  var buf = '';
  if (this.prefix && this.isStart) {
    buf += this.prefix;
  }

  if (this.isStart) {
    buf += JSON.stringify(event);
    this.isStart = false;
  } else {
    buf += ',' + JSON.stringify(event);
  }

  console.log('StringifyStream: pushing', buf);
  this.push(buf);
  callback();
};

StringifyStream.prototype._flush = function (callback) {
  this.push(']');
  callback();
};

module.exports = StringifyStream;