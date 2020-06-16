const { Transform } = require('stream');
const { inherits } = require('util');
const timestamp = require('unix-timestamp');
const converters = require('./converters');

module.exports = ApplyEventsFromDbStream;

inherits(ApplyEventsFromDbStream, Transform);

function ApplyEventsFromDbStream() {
  Transform.call(this, { objectMode: true });
  this.trans = converters.getRenamePropertyFn('_id', 'id');
}

ApplyEventsFromDbStream.prototype._transform = function (event, encoding, callback) {
  try {
    event = this.trans(event);
    // from storage/src/user/Events.js
    delete event.endTime;

    // SingleCollectionsMode - start
    delete event.userId;
    if (event.deleted == null) {
      delete event.deleted;
    }
    // SingleCollectionsModes - end

    // from storage/src/converters
    if (event.deleted) {
      event.deleted = timestamp.fromDate(event.deleted);
    }

    this.push(event);
    callback();
  } catch (err) {
    return callback(err);
  }
};
