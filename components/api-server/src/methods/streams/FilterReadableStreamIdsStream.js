const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const _ = require('lodash');

module.exports = FilterReadableStreamIdsStream;

/**
 * Sets the FileReadToken for each of the given event's attachments (if any) for the given
 * access.
 *
 * @param params
 *        params.access {Object} Access with which the API call was made
 *        params.filesReadTokenSecret {String} available in authSettings
 * @constructor
 */
function FilterReadableStreamIdsStream(params) {
  Transform.call(this, {objectMode: true});

  this.streams = params.streams;
}

inherits(FilterReadableStreamIdsStream, Transform);

FilterReadableStreamIdsStream.prototype._transform = function (event, encoding, callback) {
  // optimize for single Stream events
  if (event.streamIds.length === 1) {
    this.push(event);
  } else {
    event.streamIds = _.intersection(this.streams, event.streamIds);
    this.push(event);
  }
  callback();
};

