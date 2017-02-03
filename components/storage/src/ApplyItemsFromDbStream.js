var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters'),
    timestamp = require('unix-timestamp');

module.exports = ApplyItemsFromDbStream;

inherits(ApplyItemsFromDbStream, Transform);

function ApplyItemsFromDbStream() {
  Transform.call(this, {objectMode: true});
  this.trans = converters.getRenamePropertyFn('_id', 'id');
}

ApplyItemsFromDbStream.prototype._transform = function (event, encoding, callback) {
  try {
    event = this.trans(event);
    // from storage/src/user/Events.js
    delete event.endTime;
    // from storage/src/converters
    if (event.deleted) {
      event.deleted = timestamp.fromDate(event.deleted);
    }
    this.push(event);
    callback();
  } catch(err) {
    this.push();
    return callback(err);
  }
};