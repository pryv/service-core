/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { defaults: dataStoreDefaults } = require('pryv-datastore');
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
    created: dataStoreDefaults.UnknownDate + 1,
    modified: dataStoreDefaults.UnknownDate,
    createdBy: dataStoreDefaults.SystemAccessId,
    modifiedBy: dataStoreDefaults.SystemAccessId,
  }, extraProperties);
}

/**
 * Extract the store id and the in-store item id (without the store reference) from the given item id.
 * @returns {string[]} `[storeId, storeItemId]`
 */
// TODO refactor this into general storage (mall) utils
//      also: apply consistent semantics everywhere: itemId (full external id), storeItemId (in-store id), etc.
function parseStoreIdAndStoreItemId(fullItemId: string): [ string, string ] {
  // TODO: refactor or comment this code to clarify (why '#', etc.)
  const isDashed: number = (fullItemId.indexOf('#') === 0) ? 1 : 0;
  if (fullItemId.indexOf(':') !== (0 + isDashed)) return [LOCAL_STORE, fullItemId];
  const semiColonPos: number = fullItemId.indexOf(':', ( 1 + isDashed) );
  const storeId: string = fullItemId.substr(1 + isDashed, (semiColonPos - 1));

  if (storeId === 'system' || storeId === '_system') return [ LOCAL_STORE, fullItemId ];

  let itemId = '';
  if (semiColonPos === (fullItemId.length - 1)) { // i.e. if ':store:' or '#:store:'
    itemId = '*';
  } else {
    itemId = fullItemId.substr(semiColonPos + 1);
  }
  if (isDashed) return [storeId, '#' + itemId];
  return [ storeId, itemId ];
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
    if (stream.children != null) addStoreIdPrefixToStreams(storeId, stream.children);
  }
}

module.exports = {
  storeToStream,
  parseStoreIdAndStoreItemId,
  streamIdForStoreId,
  addStoreIdPrefixToStreams
};
