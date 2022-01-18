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

const visibleStreamsTree = SystemStreamsSerializer.getReadable()
DataStore.UserStreams.applyDefaults(visibleStreamsTree);

module.exports = {
  visibleStreamsTree
}