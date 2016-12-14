var Transform = require('stream').Transform,
    inherits = require('util').inherits;

/**
 * Stream that sends the an array of data with a prefix
 *
 * @param options
 * @constructor
 */
function StringifyStream(options) {
  if (! options) {
    options = {};
  }
  options.objectMode = true;
  this.prefix = options.prefix;
  this.isStart = true;
  Transform.call(this, options);
}

inherits(StringifyStream, Transform);

StringifyStream.prototype._transform = function _transform(array, encoding, callback) {
  array = [].concat(array);
  console.log('StringifyStream: got', array);
  var buf = '';
  if (this.prefix && this.isStart) {
    buf += this.prefix;
    this.isStart = false;
  }
  var first = true;
  array.forEach(function (e) {
    if (first) {
      buf += JSON.stringify(e);
      first = false;
    } else {
      buf += ',' + JSON.stringify(e);
    }

  });
  buf += ']';
  console.log('StringifyStream: pushing', buf);
  this.push(buf);
  callback();
};

module.exports = StringifyStream;