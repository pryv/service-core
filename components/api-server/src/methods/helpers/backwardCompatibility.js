/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getConfigUnsafe } = require('@pryv/boiler');

const OLD_PREFIX = '.';
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
  changeMultipleStreamIdsPrefix,
  changeStreamIdsPrefixInStreamQuery,
  changePrefixIdForStreams,
  replaceWithNewPrefix,
  changeStreamIdsInPermissions,
  TAG_ROOT_STREAMID,
  TAG_PREFIX,
  replaceTagsWithStreamIds,
  putOldTags,
  convertStreamIdsToOldPrefixOnResult
};

/**
 * @param {Event} event
 * @returns {void}
 */
function convertStreamIdsToOldPrefixOnResult (event) {
  if (event.streamIds == null) { return; }

  let modified = false;
  const newStreamIds = event.streamIds.map((streamId) => {
    if (SystemStreamsSerializer.isSystemStreamId(streamId)) {
      modified = true;
      return changeToOldPrefix(streamId);
    }
    return streamId;
  });
  if (modified) {
    // we cannot ensure integrity
    delete event.integrity;
    event.streamIds = newStreamIds;
  }
}

/**
 * @param {Array<string>} streamIds
 * @param {boolean} toOldPrefix
 * @returns {string[]}
 */
function changeMultipleStreamIdsPrefix (streamIds, toOldPrefix = true) {
  const changeFunction = toOldPrefix
    ? replaceWithOldPrefix
    : replaceWithNewPrefix;
  const oldStyleStreamIds = [];
  for (const streamId of streamIds) {
    oldStyleStreamIds.push(changeFunction(streamId));
  }
  return oldStyleStreamIds;
}

/**
 * @param {Array<Stream>} streams
 * @param {boolean} toOldPrefix
 * @returns {any[]}
 */
function changePrefixIdForStreams (streams, toOldPrefix = true) {
  const changeFunction = toOldPrefix
    ? replaceWithOldPrefix
    : replaceWithNewPrefix;
  for (const stream of streams) {
    stream.id = changeFunction(stream.id);
    if (stream.parentId != null) { stream.parentId = changeFunction(stream.parentId); }
    if (stream.children?.length > 0) { changePrefixIdForStreams(stream.children, toOldPrefix); }
  }
  return streams;
}

/**
 * @param {string} streamId
 * @returns {string}
 */
function replaceWithOldPrefix (streamId) {
  if (SystemStreamsSerializer.isSystemStreamId(streamId)) {
    return changeToOldPrefix(streamId);
  } else {
    return streamId;
  }
}

/**
 * @param {string} streamId
 * @returns {string}
 */
function changeToOldPrefix (streamId) {
  return (OLD_PREFIX + SystemStreamsSerializer.removePrefixFromStreamId(streamId));
}

/**
 * @param {string} streamId
 * @returns {string}
 */
function replaceWithNewPrefix (streamId) {
  if (!streamId.startsWith(OLD_PREFIX)) { return streamId; }
  const streamIdWithoutPrefix = removeOldPrefix(streamId);
  if (SystemStreamsSerializer.isCustomerSystemStreamId(streamIdWithoutPrefix)) { return SystemStreamsSerializer.addCustomerPrefixToStreamId(streamIdWithoutPrefix); }
  if (SystemStreamsSerializer.isPrivateSystemStreamId(streamIdWithoutPrefix)) { return SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix); }
  return streamIdWithoutPrefix;
  function removeOldPrefix (streamId) {
    if (streamId.startsWith(OLD_PREFIX)) { return streamId.substr(OLD_PREFIX.length); }
    return streamId;
  }
}

/**
 * @param {boolean} isStreamIdPrefixBackwardCompatibilityActive
 * @param {MethodContext} context
 * @param {GetEventsParams} params
 * @param {Result} result
 * @param {ApiCallback} next
 * @returns {Function}
 */
function changeStreamIdsPrefixInStreamQuery (isStreamIdPrefixBackwardCompatibilityActive, context, params, result, next) {
  if (!isStreamIdPrefixBackwardCompatibilityActive ||
        context.disableBackwardCompatibility) { return next(); }
  const streamsQueries = params.arrayOfStreamQueriesWithStoreId;
  const oldStyleStreamsQueries = [];
  for (const streamsQuery of streamsQueries) {
    const oldStyleStreamQuery = {};
    for (const [prop, streamIds] of Object.entries(streamsQuery)) {
      if (prop === 'storeId') {
        oldStyleStreamQuery[prop] = streamIds; // hack
      } else {
        oldStyleStreamQuery[prop] = changeMultipleStreamIdsPrefix(streamIds, false);
      }
    }
    oldStyleStreamsQueries.push(oldStyleStreamQuery);
  }
  params.arrayOfStreamQueriesWithStoreId = oldStyleStreamsQueries;
  next();
}

/**
 * @param {Array<Permission>} permissions
 * @param {boolean} toOldPrefix
 * @returns {any[]}
 */
function changeStreamIdsInPermissions (permissions, toOldPrefix = true) {
  const changeFunction = toOldPrefix
    ? replaceWithOldPrefix
    : replaceWithNewPrefix;
  const oldStylePermissions = [];
  for (const permission of permissions) {
    if (permission.streamId != null) {
      // do not change "feature" permissions
      permission.streamId = changeFunction(permission.streamId);
    }
    oldStylePermissions.push(permission);
  }
  return oldStylePermissions;
}

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
