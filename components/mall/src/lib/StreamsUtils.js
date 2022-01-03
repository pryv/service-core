/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { DataStore } = require('../../interfaces/DataStore');
const LOCAL_STORE = 'local';
import type { Stream } from 'business/src/streams';

/**
 * Create a Stream object from a DataStore 
 * @param {DataStore} store 
 * @param {Object} extraProperties 
 */
function storeToStream(store: DataStore, extraProperties: mixed): Stream {
  return Object.assign({
    id: ':' + store.id + ':',
    name: store.name,
    parentId: null,  
    created: DataStore.UNKOWN_DATE,
    modified: DataStore.UNKOWN_DATE,
    createdBy: DataStore.BY_SYSTEM,
    modifiedBy: DataStore.BY_SYSTEM,
  }, extraProperties);
}

/**
 * Get the storeId related to this stream, and the streamId without the store reference
 * @returns {object} [storeId: ..., streamIdWithoutStorePrefix]
 */
function storeIdAndStreamIdForStreamId(fullStreamId: string): [ string, string ] {
  const isDashed: number = (fullStreamId.indexOf('#') === 0) ? 1 : 0;
  if (fullStreamId.indexOf(':') !== (0 + isDashed)) return [LOCAL_STORE, fullStreamId];
  const semiColonPos: number = fullStreamId.indexOf(':', ( 1 + isDashed) );
  const storeId: string = fullStreamId.substr(1 + isDashed, (semiColonPos - 1));

  if (storeId === 'system' || storeId === '_system') return [ LOCAL_STORE, fullStreamId ];

  let streamId: string = '';
  if (semiColonPos === (fullStreamId.length - 1)) { // if ':store:' or '#:store:'
    streamId = '*';
  } else {
    streamId = fullStreamId.substr(semiColonPos + 1);
  }
  if (isDashed) return [storeId, '#' + streamId];
  return [ storeId, streamId ];
}

/**
 * Get full streamId from store + cleanstreanId
 * @returns {string} 
 */
function streamIdForStoreId(streamId: string, storeId: string): string {
  if (storeId === LOCAL_STORE) return streamId;
  const isDashed: boolean = (streamId.indexOf('#') === 0);
  let sstreamId: string = isDashed ? streamId.substr(1) : streamId;
  if (sstreamId === '*') sstreamId = '';
  if (isDashed) return '#:' + storeId + ':' + sstreamId;
  return ':' + storeId + ':' + sstreamId;
}

/**
 * Add storeId to streamIds to parentIds of a tree
 * Add storeId to "null" parentId
 * @param {identifier} storeId 
 * @param {Array<Streams>} streams 
 */
function addStoreIdPrefixToStreams(storeId: string, streams: Array<Stream>): void {
  for (const stream: Stream of streams) {
    stream.id = streamIdForStoreId(stream.id, storeId);
    if (stream.parentId != null) { 
      stream.parentId = streamIdForStoreId(stream.parentId, storeId);
    } else {
      stream.parentId = streamIdForStoreId('*', storeId);
    }
    if (stream.children != null) addStoreIdPrefixToStreams(storeId, stream.children)
  }
}

module.exports = {
  storeToStream,
  storeIdAndStreamIdForStreamId,
  streamIdForStoreId,
  addStoreIdPrefixToStreams
}