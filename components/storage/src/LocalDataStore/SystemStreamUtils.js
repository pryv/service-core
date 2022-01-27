/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Utilities for querying stores
 */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { DataStore } = require('pryv-datastore');

let visibleStreamsTree = [];
try {
  visibleStreamsTree = SystemStreamsSerializer.getReadable();
  DataStore.Defaults.applyOnStreams(visibleStreamsTree);
} catch (err) {
  console.log('This should be fixed!! It happens when the system streams are not yet loaded during some test suites.. ');
}

module.exports = {
  visibleStreamsTree
}