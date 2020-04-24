const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const _ = require('lodash');

module.exports = FilterStreamIdsStream;

/**
 * Sets the FileReadToken for each of the given event's attachments (if any) for the given
 * access.
 *
 * @param params
 *        params.access {Object} Access with which the API call was made
 *        params.filesReadTokenSecret {String} available in authSettings
 * @constructor
 */
function FilterStreamIdsStream(params) {
  Transform.call(this, {objectMode: true});

  this.streams = params.streams;
}

inherits(FilterStreamIdsStream, Transform);

FilterStreamIdsStream.prototype._transform = function (event, encoding, callback) {
  // optimize for single Stream events
  if (event.streamIds.length === 1) {
    this.push(event);
  } else {
    event.streamIds = _.intersection(this.streams, event.streamIds);
    this.push(event);
  }
  callback();
};

