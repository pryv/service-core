/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { defaults: dataStoreDefaults } = require('pryv-datastore');
import type { Stream } from 'business/src/streams';
const { getFullItemId } = require('./storeDataUtils');

module.exports = {
  storeToStream,
  addStoreIdPrefixToStreams
};

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
