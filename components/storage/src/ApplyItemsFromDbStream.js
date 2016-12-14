var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters');

module.exports = ApplyItemsFromDbStream;

function ApplyItemsFromDbStream(options) {
  if ( ! (this instanceof ApplyItemsFromDbStream)) {
    return new ApplyItemsFromDbStream(options);
  }
  if (! options) {
    options = {};
  }
  this.trans = converters.getRenamePropertyFn('id', '_id');
  options.objectMode = true;
  Transform.call(this, options);
}

inherits(ApplyItemsFromDbStream, Transform);

ApplyItemsFromDbStream.prototype._transform = function _transform(obj, encoding, callback) {
  try {
    console.log('itemsFromDBStream, got',obj);
    obj = this.trans(obj);
    console.log('itemsFromDBStream, outputing',obj);
    this.push(obj);
    callback();
  } catch(err) {
    this.push();
    return callback(err);
  }
};