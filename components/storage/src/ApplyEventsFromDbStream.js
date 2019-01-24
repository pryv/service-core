var Transform = require('stream').Transform,
    inherits = require('util').inherits,
    converters = require('./converters'),
    timestamp = require('unix-timestamp');

module.exports = ApplyEventsFromDbStream;

inherits(ApplyEventsFromDbStream, Transform);

function ApplyEventsFromDbStream() {
  Transform.call(this, {objectMode: true});
  this.trans = converters.getRenamePropertyFn('_id', 'id');
}

ApplyEventsFromDbStream.prototype._transform = function (event, encoding, callback) {
  try {
    event = this.trans(event);
    // from storage/src/user/Events.js
    delete event.endTime;

    // SingleCollectionsMode - start
    delete event.userId; // delete all event.userId found
    if (event.deleted == null) { // due to the global change involved
      delete event.deleted;
    }
    // SingleCollectionsModes - end

    // from storage/src/converters
    if (event.deleted) {
      event.deleted = timestamp.fromDate(event.deleted);
    }

    this.push(event);
    callback();
  } catch(err) {
    return callback(err);
  }
};