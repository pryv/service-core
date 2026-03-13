/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * System streams serializer — config-derived queries for account streams.
 * All values pre-computed at init (dataset is ~15 streams — no lazy caching needed).
 */

const treeUtils = require('utils').treeUtils;
const { getConfig } = require('@pryv/boiler');
const { IS_SHOWN, IS_INDEXED, IS_UNIQUE } = require('./features');

const PRYV_PREFIX = ':_system:';
const CUSTOMER_PREFIX = ':system:';
const STREAM_ID_ACCOUNT = PRYV_PREFIX + 'account';
const ALL = 'all';

// Module-level state — all set by initializeState()
let initialized = false;
let streamIdWithPrefixToWithout = null;
let accountStreamIdWithoutPrefixToWith = null;

// ── Init ──────────────────────────────────────────────────────────

async function init () {
  if (initialized) { return; }
  const config = await getConfig();
  const settings = config.get('systemStreams');
  if (settings == null) {
    throw Error('Invalid system streams settings');
  }
  initializeState(settings);
  initialized = true;
}

/**
 * Test-only — reloads from a custom config.
 * See "config.default-streams.test.js" (V9QB, 5T5S, ARD9).
 */
async function reloadSerializer (config) {
  config = config || (await getConfig());
  if (config.get('NODE_ENV') !== 'test') {
    console.error('this is meant to be used in test only');
    process.exit(1);
  }
  initializeState(config.get('systemStreams'));
  initialized = true;
}

// ── Pre-computed data (all set at init) ───────────────────────────

function initializeState (settings) {
  exports_.allAsTree = settings;
  exports_.accountChildren = treeUtils.findById(settings, STREAM_ID_ACCOUNT).children;

  // Account stream maps (flat)
  exports_.accountMap = filterMapStreams(exports_.accountChildren, ALL);
  exports_.accountLeavesMap = buildLeavesMap(exports_.accountChildren);
  // ID arrays
  const accountStreamIds = Object.keys(exports_.accountMap);
  const readableIds = Object.keys(filterMapStreams(exports_.accountChildren, IS_SHOWN));
  const readableSet = new Set(readableIds);
  exports_.forbiddenStreamIds = accountStreamIds.filter(k => !readableSet.has(k));
  exports_.indexedFieldsWithoutPrefix = Object.keys(filterMapStreams(exports_.accountChildren, IS_INDEXED)).map(stripPrefix);
  exports_.uniqueFieldsWithoutPrefix = Object.keys(filterMapStreams(exports_.accountChildren, IS_UNIQUE)).map(stripPrefix);

  // Prefix translation maps
  streamIdWithPrefixToWithout = {};
  accountStreamIdWithoutPrefixToWith = {};
  const allStreamIds = treeUtils.flattenTree(settings).map((s) => s.id);
  for (const prefixed of allStreamIds) {
    const unprefixed = stripPrefix(prefixed);
    streamIdWithPrefixToWithout[prefixed] = unprefixed;
    if (exports_.accountMap[prefixed] != null) {
      accountStreamIdWithoutPrefixToWith[unprefixed] = prefixed;
    }
  }
}

function buildLeavesMap (children) {
  const flatList = treeUtils.flattenTreeWithoutParents(children);
  const map = {};
  for (const stream of flatList) {
    map[stream.id] = stream;
  }
  return map;
}

// ── Prefix utilities ──────────────────────────────────────────────

function removePrefixFromStreamId (streamIdWithPrefix) {
  return streamIdWithPrefixToWithout[streamIdWithPrefix] || streamIdWithPrefix;
}

function addCorrectPrefixToAccountStreamId (streamId) {
  const prefixed = accountStreamIdWithoutPrefixToWith[streamId];
  if (prefixed == null) {
    throw new Error('trying to call addCorrectPrefixToAccountStreamId() with non-account streamId: ' + streamId);
  }
  return prefixed;
}

// ── Internal helpers ──────────────────────────────────────────────

function filterMapStreams (streams, filter = IS_SHOWN) {
  const streamsMap = {};
  if (!Array.isArray(streams)) { return streamsMap; }
  const flatList = treeUtils.flattenTree(streams);
  for (const stream of flatList) {
    if (filter === ALL || stream[filter]) {
      streamsMap[stream.id] = stream;
    }
  }
  return streamsMap;
}

function stripPrefix (streamId) {
  if (streamId.startsWith(PRYV_PREFIX)) { return streamId.substring(PRYV_PREFIX.length); }
  if (streamId.startsWith(CUSTOMER_PREFIX)) { return streamId.substring(CUSTOMER_PREFIX.length); }
  throw new Error('serializer initialization: removePrefixFromStreamId(streamId) should be called with a prefixed streamId');
}

// ── Exports ───────────────────────────────────────────────────────

const exports_ = module.exports = {
  // Constants
  STREAM_ID_ACCOUNT,
  // Lifecycle
  init,
  reloadSerializer,
  // Data properties (set by initializeState, null before init)
  allAsTree: null,
  accountChildren: null,
  accountMap: null,
  accountLeavesMap: null,
  forbiddenStreamIds: null,
  indexedFieldsWithoutPrefix: null,
  uniqueFieldsWithoutPrefix: null,
  // Prefix utilities
  removePrefixFromStreamId,
  addCorrectPrefixToAccountStreamId
};
