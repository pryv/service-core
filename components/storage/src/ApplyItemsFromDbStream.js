var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters');

module.exports = ApplyItemsFromDbStream;

inherits(ApplyItemsFromDbStream, Transform);

function ApplyItemsFromDbStream() {
  Transform.call(this, {objectMode: true});
  this.trans = converters.getRenamePropertyFn('_id', 'id');
}

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