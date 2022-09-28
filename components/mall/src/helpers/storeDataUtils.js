/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { APIError, factory: apiErrors } = require('errors');
const { errors: dataStoreErrors } = require('pryv-datastore');
// HACK: replace data store errors factory methods with API errors factory's
Object.assign(dataStoreErrors, apiErrors);

const LOCAL_STORE_ID = 'local';
const STORE_ID_MARKER = ':';

const storeDataUtils = module.exports = {
  LocalStoreId: LOCAL_STORE_ID,
  parseStoreIdAndStoreItemId,
  getFullItemId,
  throwAPIError
};
Object.freeze(storeDataUtils);

/**
 * Extract the store id and the in-store item id (without the store reference) from the given item id.
 * For streams, converts the store's root pseudo-stream id (`:store:`) to `*`.
 * @param {string} fullItemId
 * @returns {string[]} `[storeId, storeItemId]`
 */
function parseStoreIdAndStoreItemId (fullItemId) {
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
 * @param {string} storeId
 * @param {storeStreamId}
 * @returns {string}
 */
function getFullItemId (storeId, storeItemId) {
  if (storeId === LOCAL_STORE_ID) return storeItemId;
  return STORE_ID_MARKER + storeId + STORE_ID_MARKER + (storeItemId === '*' ? '' : storeItemId);
}

/**
 * Handle the given error from a data store, wrapping it as an API error if needed
 * before throwing it further.
 * @param {*} err
 * @param {string} storeId
 */
function throwAPIError (err, storeId) {
  if (!(err instanceof Error)) {
    err = new Error(err);
  }
  if (!(err instanceof APIError)) {
    err = apiErrors.unexpectedError(err);
  }
  if (storeId != null) {
    $$(err);
    err.message = `Error from data store "${storeId}": ${err.message}`;
  }
  throw err;
}
