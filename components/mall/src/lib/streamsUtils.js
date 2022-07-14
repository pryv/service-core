/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { defaults: dataStoreDefaults } = require('pryv-datastore');
const LOCAL_STORE_ID = 'local';
const STORE_ID_MARKER = ':';
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
    created: dataStoreDefaults.UnknownDate + 1,
    modified: dataStoreDefaults.UnknownDate,
    createdBy: dataStoreDefaults.SystemAccessId,
    modifiedBy: dataStoreDefaults.SystemAccessId,
  }, extraProperties);
}

/**
 * Extract the store id and the in-store item id (without the store reference) from the given item id.
 * For streams, converts the store's root pseudo-stream id (`:store:`) to `*`.
 * @returns {string[]} `[storeId, storeItemId]`
 */
// TODO refactor this into general storage (mall) utils
//      also: apply consistent semantics everywhere: itemId (full external id), storeItemId (in-store id), etc.
function parseStoreIdAndStoreItemId(fullItemId: string): [ string, string ] {
  if (!fullItemId.startsWith(STORE_ID_MARKER)) return [LOCAL_STORE_ID, fullItemId];

  const endMarkerIndex = fullItemId.indexOf(STORE_ID_MARKER, 1);
  const storeId = fullItemId.substring(1, endMarkerIndex);

  if (storeId === 'system' || storeId === '_system') return [LOCAL_STORE_ID, fullItemId];

  let storeItemId;
  if (endMarkerIndex === (fullItemId.length - 1)) { // ':storeId:', i.e. pseudo-stream representing store root
    storeItemId = '*';
  } else {
    storeItemId = fullItemId.substring(endMarkerIndex + 1);
  }
  return [storeId, storeItemId];
}

/**
 * Get full item id from the given store id and in-store item id.
 * For streams, converts the `*` id to the store's root pseudo-stream (`:store:`).
 * @returns {string}
 */
function getFullItemId(storeId: string, storeStreamId: string): string {
  if (storeId === LOCAL_STORE_ID) return storeStreamId;
  return STORE_ID_MARKER + storeId + STORE_ID_MARKER + (storeStreamId === '*' ? '' : storeStreamId);
}

/**
 * Add storeId to streamIds to parentIds of a tree
 * Add storeId to "null" parentId
 * @param {identifier} storeId
 * @param {Array<Streams>} streams
 */
function addStoreIdPrefixToStreams(storeId: string, streams: Array<Stream>): void {
  for (const stream: Stream of streams) {
    stream.id = getFullItemId(storeId, stream.id);
    if (stream.parentId != null) {
      stream.parentId = getFullItemId(storeId, stream.parentId);
    } else {
      stream.parentId = getFullItemId(storeId, '*');
    }
    if (stream.children != null) addStoreIdPrefixToStreams(storeId, stream.children);
  }
}

module.exports = {
  storeToStream,
  parseStoreIdAndStoreItemId,
  getFullItemId,
  addStoreIdPrefixToStreams
};
