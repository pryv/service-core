/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const { getConfigUnsafe } = require('@pryv/boiler');

// loaded lazily from config using loadTagConfigIfNeeded()
let TAG_ROOT_STREAMID;
let TAG_PREFIX;
let TAG_PREFIX_LENGTH;
loadTagConfigIfNeeded();

/**
 * @returns {void}
 */
function loadTagConfigIfNeeded () {
  if (TAG_PREFIX != null) { return; } // only testing this one as all 3 values are set together
  const config = getConfigUnsafe(true);
  TAG_PREFIX = config.get('backwardCompatibility:tags:streamIdPrefix');
  TAG_ROOT_STREAMID = config.get('backwardCompatibility:tags:rootStreamId');
  TAG_PREFIX_LENGTH = TAG_PREFIX.length;
}

module.exports = {
  TAG_ROOT_STREAMID,
  TAG_PREFIX,
  replaceTagsWithStreamIds,
  putOldTags
};

/**
 * Replaces the tags in an event with streamIds with the corresponding prefix
 * Deletes the tags.
 * @param {Event} event
 * @returns {any}
 */
function replaceTagsWithStreamIds (event) {
  if (event.tags == null) { return event; }
  for (const tag of event.tags) {
    event.streamIds.push(TAG_PREFIX + tag);
  }
  delete event.tags;
  return event;
}

/**
 * put back tags in events, taken from its streamIds
 * @param {Event} event
 * @returns {any}
 */
function putOldTags (event) {
  event.tags = [];
  for (const streamId of event.streamIds) {
    if (isTagStreamId(streamId)) {
      event.tags.push(removeTagPrefix(streamId));
    }
  }
  return event;
}

/**
 * @param {string} streamId
 * @returns {string}
 */
function removeTagPrefix (streamId) {
  return streamId.slice(TAG_PREFIX_LENGTH);
}

/**
 * @param {string} streamId
 * @returns {boolean}
 */
function isTagStreamId (streamId) {
  return streamId.startsWith(TAG_PREFIX);
}
