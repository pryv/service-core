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
    delete event.userId;
    if (event.deleted == null) {
      delete event.deleted;
    }
    // SingleCollectionsModes - end

    // from storage/src/converters
    if (event.deleted) {
      event.deleted = timestamp.fromDate(event.deleted);
    } 

    // migration to #streamIds
    if (event.streamId) {
      console.log("******** ZUT 3", event);
      callback(new Error("I should not find anymore event with streamId"));
    }
    if (event.streamIds && event.streamIds.length > 0) {
      event.streamId = event.streamIds[0];
    }
    

    this.push(event);
    callback();
  } catch(err) {
    return callback(err);
  }
};