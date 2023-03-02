/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { defaults: dataStoreDefaults } = require('@pryv/datastore');
const { getFullItemId } = require('./storeDataUtils');
module.exports = {
  createStoreRootStream,
  addStoreIdPrefixToStreams
};
/**
 * Create a pseudo-stream representing a data store's root.
 * @param {{id: string, name: string}} storeDescription
 * @param {Object} extraProperties
 * @returns {any}
 */
function createStoreRootStream (storeDescription, extraProperties) {
  return Object.assign({
    id: ':' + storeDescription.id + ':',
    name: storeDescription.name,
    parentId: null,
    created: dataStoreDefaults.UnknownDate + 1,
    modified: dataStoreDefaults.UnknownDate,
    createdBy: dataStoreDefaults.SystemAccessId,
    modifiedBy: dataStoreDefaults.SystemAccessId
  }, extraProperties);
}
/**
 * Add storeId to streamIds to parentIds of a tree
 * Add storeId to "null" parentId
 * @param {string} storeId  undefined
 * @param {Array<Stream>} streams  undefined
 * @returns {void}
 */
function addStoreIdPrefixToStreams (storeId, streams) {
  for (const stream of streams) {
    stream.id = getFullItemId(storeId, stream.id);
    if (stream.parentId != null) {
      stream.parentId = getFullItemId(storeId, stream.parentId);
    } else {
      stream.parentId = getFullItemId(storeId, '*');
    }
    if (stream.children != null) { addStoreIdPrefixToStreams(storeId, stream.children); }
  }
}
