/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;
const inherits = require('util').inherits;
const utils = require('utils');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

module.exports = ChangeStreamIdPrefixStream;

/**
 * For retrocompatibility, change system stream id prefix
 * This needs to be run before "SetSingleStreamIdStream.js"
 * @constructor
 */
function ChangeStreamIdPrefixStream() {
  Transform.call(this, {objectMode: true});
}

inherits(ChangeStreamIdPrefixStream, Transform);

ChangeStreamIdPrefixStream.prototype._transform = function (event, encoding, callback) {
  const streamIds: Array<string> = [];
  for (const streamId of event.streamIds) {
    if (SystemStreamsSerializer.isSystemStreamId(streamId)) {
      streamIds.push(ChangeToOldPrefix(streamId));
    } else {
      streamIds.push(streamId);
    }
  }
  event.streamIds = streamIds;
  this.push(event);
  callback();
};

function ChangeToOldPrefix(streamId: string): string {
  return '.' + SystemStreamsSerializer.removePrefixFromStreamId(streamId);
}
