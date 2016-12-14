var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters');

module.exports = ApplyItemsFromDbStream;

inherits(ApplyItemsFromDbStream, Transform);

function ApplyItemsFromDbStream() {
  Transform.call(this, {objectMode: true});
  this.trans = converters.getRenamePropertyFn('_id', 'id');
}

ApplyItemsFromDbStream.prototype._transform = function (event, encoding, callback) {
  try {
    event = this.trans(event);
    this.push(event);
    callback();
  } catch(err) {
    this.push();
    return callback(err);
  }
};