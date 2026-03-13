/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * System streams serializer — config-derived queries for account streams.
 * Flat module (no class). All callers use `const S = require(...)` then `S.method()`.
 */

const treeUtils = require('utils').treeUtils;
const { getConfig } = require('@pryv/boiler');
const { features } = require('api-server/config/components/systemStreams');

const PRYV_PREFIX = ':_system:';
const CUSTOMER_PREFIX = ':system:';
const STREAM_ID_ACCOUNT = PRYV_PREFIX + 'account';
const IS_SHOWN = features.IS_SHOWN;
const IS_INDEXED = features.IS_INDEXED;
const IS_EDITABLE = features.IS_EDITABLE;
const IS_UNIQUE = features.IS_UNIQUE;
const ALL = 'all';

// Module-level state
let systemStreamsSettings = null;
let initialized = false;

// Cached values (cleared on reload)
let allAsTree = null;
let readableAccountMap = null;
let readableAccountStreamIds = null;
let editableAccountMap = null;
let accountMap = null;
let accountLeavesMap = null;
let accountStreamIds = null;
let indexedAccountStreamsIdsWithoutPrefix = null;
let uniqueAccountStreamsIdsWithoutPrefix = null;
let accountStreamsIdsForbiddenForReading = null;
let accountChildren = null;
let streamIdWithPrefixToWithout = null;
let accountStreamIdWithoutPrefixToWith = null;
let allAccountStreamIdsForUser = null;

// ── Init ──────────────────────────────────────────────────────────

async function init () {
  if (initialized) { return; }
  const config = await getConfig();
  systemStreamsSettings = config.get('systemStreams');
  if (systemStreamsSettings == null) {
    throw Error('Invalid system streams settings');
  }
  initializeState();
  initialized = true;
}

/**
 * Reloads the serializer based on the config provided as parameter.
 * See "config.default-streams.test.js" (V9QB, 5T5S, ARD9) for usage example.
 * Test-only.
 */
async function reloadSerializer (config) {
  config = config || (await getConfig());
  if (config.get('NODE_ENV') !== 'test') {
    console.error('this is meant to be used in test only');
    process.exit(1);
  }
  systemStreamsSettings = config.get('systemStreams');
  clearCaches();
  initializeState();
  initialized = true;
}

function clearCaches () {
  allAsTree = null;
  readableAccountStreamIds = null;
  readableAccountMap = null;
  editableAccountMap = null;
  accountMap = null;
  accountLeavesMap = null;
  accountStreamIds = null;
  indexedAccountStreamsIdsWithoutPrefix = null;
  uniqueAccountStreamsIdsWithoutPrefix = null;
  accountStreamsIdsForbiddenForReading = null;
  accountChildren = null;
  streamIdWithPrefixToWithout = null;
  accountStreamIdWithoutPrefixToWith = null;
  allAccountStreamIdsForUser = null;
}

// ── Query functions ───────────────────────────────────────────────

function getAll () {
  if (allAsTree != null) { return allAsTree; }
  allAsTree = systemStreamsSettings;
  return allAsTree;
}

function getAccountChildren () {
  if (accountChildren != null) { return accountChildren; }
  accountChildren = treeUtils.findById(allAsTree, STREAM_ID_ACCOUNT).children;
  return accountChildren;
}

function getReadableAccountMap () {
  if (readableAccountMap != null) { return readableAccountMap; }
  readableAccountMap = filterMapStreams(getAccountChildren(), IS_SHOWN);
  return readableAccountMap;
}

function getReadableAccountStreamIds () {
  if (readableAccountStreamIds != null) { return readableAccountStreamIds; }
  readableAccountStreamIds = Object.keys(getReadableAccountMap());
  return readableAccountStreamIds;
}

function getEditableAccountMap () {
  if (editableAccountMap != null) { return editableAccountMap; }
  editableAccountMap = filterMapStreams(getAccountChildren(), IS_EDITABLE);
  return editableAccountMap;
}

function getAccountMap () {
  if (accountMap != null) { return accountMap; }
  accountMap = filterMapStreams(getAccountChildren(), ALL);
  return accountMap;
}

function getAccountStreamIds () {
  if (accountStreamIds != null) { return accountStreamIds; }
  accountStreamIds = Object.keys(getAccountMap());
  return accountStreamIds;
}

function getAccountStreamIdsForUser () {
  if (allAccountStreamIdsForUser != null) { return allAccountStreamIdsForUser; }
  const result = {
    uniqueAccountFields: [],
    readableAccountFields: [],
    accountFields: [],
    accountFieldsWithPrefix: []
  };
  const streams = getAccountMap();
  for (const streamId of Object.keys(streams)) {
    result.accountFieldsWithPrefix.push(streamId);
    const withoutPrefix = removePrefixFromStreamId(streamId);
    if (streams[streamId].isUnique === true) {
      result.uniqueAccountFields.push(withoutPrefix);
    }
    if (streams[streamId].isShown === true) {
      result.readableAccountFields.push(withoutPrefix);
    }
    result.accountFields.push(withoutPrefix);
  }
  allAccountStreamIdsForUser = result;
  return allAccountStreamIdsForUser;
}

function getAccountFieldDefaultValue (fieldId) {
  const map = filterMapStreams(getAll(), ALL);
  return map[PRYV_PREFIX + fieldId]?.default;
}

function getAccountLeavesMap () {
  if (accountLeavesMap != null) { return accountLeavesMap; }
  const flatStreamsList = treeUtils.flattenTreeWithoutParents(getAccountChildren());
  const streamsMap = {};
  for (let i = 0; i < flatStreamsList.length; i++) {
    streamsMap[flatStreamsList[i].id] = flatStreamsList[i];
  }
  accountLeavesMap = streamsMap;
  return accountLeavesMap;
}

function getIndexedAccountStreamsIdsWithoutPrefix () {
  if (indexedAccountStreamsIdsWithoutPrefix != null) { return indexedAccountStreamsIdsWithoutPrefix; }
  const indexedStreamIds = Object.keys(filterMapStreams(getAccountChildren(), IS_INDEXED));
  indexedAccountStreamsIdsWithoutPrefix = indexedStreamIds.map(removePrefixFromStreamId);
  return indexedAccountStreamsIdsWithoutPrefix;
}

function isUniqueAccountField (field) {
  return getUniqueAccountStreamsIdsWithoutPrefix().includes(field);
}

function getUniqueAccountStreamsIdsWithoutPrefix () {
  if (uniqueAccountStreamsIdsWithoutPrefix != null) { return uniqueAccountStreamsIdsWithoutPrefix; }
  const uniqueStreamIds = Object.keys(filterMapStreams(getAccountChildren(), IS_UNIQUE));
  uniqueAccountStreamsIdsWithoutPrefix = uniqueStreamIds.map(removePrefixFromStreamId);
  return uniqueAccountStreamsIdsWithoutPrefix;
}

function getAccountStreamsIdsForbiddenForReading () {
  if (accountStreamsIdsForbiddenForReading != null) { return accountStreamsIdsForbiddenForReading; }
  const allKeys = Object.keys(getAccountMap());
  const readableKeys = new Set(Object.keys(getReadableAccountMap()));
  accountStreamsIdsForbiddenForReading = allKeys.filter(k => !readableKeys.has(k));
  return accountStreamsIdsForbiddenForReading;
}

function removePrefixFromStreamId (streamIdWithPrefix) {
  const streamIdWithoutPrefix = streamIdWithPrefixToWithout[streamIdWithPrefix];
  return streamIdWithoutPrefix || streamIdWithPrefix;
}

function hasSystemStreamPrefix (streamIdWithPrefix) {
  return (streamIdWithPrefix.startsWith(PRYV_PREFIX) ||
          streamIdWithPrefix.startsWith(CUSTOMER_PREFIX));
}

function addCorrectPrefixToAccountStreamId (streamId) {
  const streamIdWithPrefix = accountStreamIdWithoutPrefixToWith[streamId];
  if (streamIdWithPrefix == null) {
    throw new Error('trying to call addCorrectPrefixToAccountStreamId() with non-account streamId: ' +
              streamId);
  }
  return streamIdWithPrefix;
}

// ── Internal helpers ──────────────────────────────────────────────

function filterMapStreams (streams, filter = IS_SHOWN) {
  const streamsMap = {};
  if (!Array.isArray(streams)) {
    return streamsMap;
  }
  const flatStreamsList = treeUtils.flattenTree(streams);
  for (let i = 0; i < flatStreamsList.length; i++) {
    if (filter === ALL || flatStreamsList[i][filter]) {
      streamsMap[flatStreamsList[i].id] = flatStreamsList[i];
    }
  }
  return streamsMap;
}

function initializeState () {
  getAll();
  const allStreamIds = treeUtils.flattenTree(allAsTree).map((s) => s.id);
  streamIdWithPrefixToWithout = {};
  accountStreamIdWithoutPrefixToWith = {};
  for (const streamIdWithPrefix of allStreamIds) {
    const streamIdWithoutPrefix = stripPrefix(streamIdWithPrefix);
    streamIdWithPrefixToWithout[streamIdWithPrefix] = streamIdWithoutPrefix;
    if (getAccountMap()[streamIdWithPrefix] != null) {
      accountStreamIdWithoutPrefixToWith[streamIdWithoutPrefix] = streamIdWithPrefix;
    }
  }
}

function stripPrefix (streamId) {
  if (streamId.startsWith(PRYV_PREFIX)) { return streamId.substring(PRYV_PREFIX.length); }
  if (streamId.startsWith(CUSTOMER_PREFIX)) { return streamId.substring(CUSTOMER_PREFIX.length); }
  throw new Error('serializer initialization: removePrefixFromStreamId(streamId) should be called with a prefixed streamId');
}

// ── Exports ───────────────────────────────────────────────────────

module.exports = {
  STREAM_ID_ACCOUNT,
  init,
  reloadSerializer,
  getAll,
  getAccountChildren,
  getReadableAccountMap,
  getReadableAccountStreamIds,
  getEditableAccountMap,
  getAccountMap,
  getAccountStreamIds,
  getAccountStreamIdsForUser,
  getAccountFieldDefaultValue,
  getAccountLeavesMap,
  getIndexedAccountStreamsIdsWithoutPrefix,
  isUniqueAccountField,
  getUniqueAccountStreamsIdsWithoutPrefix,
  getAccountStreamsIdsForbiddenForReading,
  removePrefixFromStreamId,
  hasSystemStreamPrefix,
  addCorrectPrefixToAccountStreamId
};
