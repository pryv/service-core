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
function storeIdAndStreamIdForStreamId(fullStreamId) {
  const isDashed = (fullStreamId.indexOf('#') === 0) ? 1 : 0;
  if (fullStreamId.indexOf(':') !== (0 + isDashed)) return [LOCAL_STORE, fullStreamId];
  const semiColonPos = fullStreamId.indexOf(':', ( 1 + isDashed) );
  const storeId = fullStreamId.substr(1 + isDashed, (semiColonPos - 1));

  
  let streamId = '';
  if (semiColonPos === (fullStreamId.length - 1)) { // if ':store:' or '#:store:'
    streamId = '*';
  } else {
    streamId = fullStreamId.substr(semiColonPos + 1);
  }
  if (isDashed) return [storeId, '#' + streamId];
  return [ storeId, streamId];
}

/**
 * Get full streamId from source + cleanstreanId
 * @returns {string} 
 */
 function streamIdForStoreId(streamId, storeId) {
  if (storeId === LOCAL_STORE) return streamId;
  const isDashed = (streamId.indexOf('#') === 0);
  let sstreamId = isDashed ? streamId.substr(1) : streamId;
  if (sstreamId === '*') sstreamId = '';
  if (isDashed) return '#:' + storeId + ':' + sstreamId;
  return ':' + storeId + ':' + sstreamId;
}


module.exports = {
  sourceToStream: sourceToStream,
  storeIdAndStreamIdForStreamId: storeIdAndStreamIdForStreamId,
  streamIdForStoreId: streamIdForStoreId
}