/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { defaults: dataStoreDefaults } = require('pryv-datastore');
import type { Stream } from 'business/src/streams';
const { getFullItemId } = require('./storeDataUtils');

module.exports = {
  createStoreRootStream,
  addStoreIdPrefixToStreams,
};

/**
 * Create a pseudo-stream representing a data store's root.
 * @param {{id: string, name: string}} storeInfo - Data store or similar object
 * @param {Object} extraProperties
 */
function createStoreRootStream(storeInfo, extraProperties): Stream {
  return Object.assign(
    {
      id: ':' + storeInfo.id + ':',
      name: storeInfo.name,
      parentId: null,
      created: dataStoreDefaults.UnknownDate + 1,
      modified: dataStoreDefaults.UnknownDate,
      createdBy: dataStoreDefaults.SystemAccessId,
      modifiedBy: dataStoreDefaults.SystemAccessId,
    },
    extraProperties
  );
}

/**
 * Add storeId to streamIds to parentIds of a tree
 * Add storeId to "null" parentId
 * @param {identifier} storeId
 * @param {Array<Streams>} streams
 */
function addStoreIdPrefixToStreams(
  storeId: string,
  streams: Array<Stream>
): void {
  for (const stream of streams) {
    stream.id = getFullItemId(storeId, stream.id);
    if (stream.parentId != null) {
      stream.parentId = getFullItemId(storeId, stream.parentId);
    } else {
      stream.parentId = getFullItemId(storeId, '*');
    }
    if (stream.children != null)
      addStoreIdPrefixToStreams(storeId, stream.children);
  }
}
