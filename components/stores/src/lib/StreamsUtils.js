/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { DataSource } = require('../../interfaces/DataSource');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const LOCAL_STORE = 'local';

/**
 * Create a Stream object from a DataSource 
 * @param {DataSource} source 
 * @param {Object} extraProperties 
 */
function sourceToStream(source, extraProperties) {
  return Object.assign({
    id: source.id,
    name: source.name,
    parentId: null,
    created: DataSource.UNKOWN_DATE,
    modified: DataSource.UNKOWN_DATE,
    createdBy: DataSource.BY_SYSTEM,
    modifiedBy: DataSource.BY_SYSTEM,
  }, extraProperties);
}

/**
 * Get the sourceId related to this stream, and the streamId without the store reference
 * @returns {object} [storeId: ..., streamIdWithoutStorePrefix]
 */
function storeIdAndStreamIdForStreamId(streamId) {
  if (streamId.indexOf('.') !== 0) return [LOCAL_STORE, streamId];
  if (SystemStreamsSerializer.isSystemStream(streamId)) return [LOCAL_STORE, streamId]; // probably to be changed at some point 
  const dashPos = streamId.indexOf('-');
  if (dashPos < 1) return [streamId.substr(1), '*'];
  return [streamId.substr(1, (dashPos - 1)), streamId.substr(dashPos + 1)];
}

/**
 * Get full streamId from source + cleanstreanId
 * @returns {string} 
 */
 function streamIdForStoreId(cleanStreamId, storeId) {
  if (storeId === LOCAL_STORE) return cleanStreamId;
  if (cleanStreamId === '*') return '.' + storeId;
  return '.' + storeId + '-' + cleanStreamId;
}


module.exports = {
  sourceToStream: sourceToStream,
  storeIdAndStreamIdForStreamId: storeIdAndStreamIdForStreamId,
  streamIdForStoreId: streamIdForStoreId
}