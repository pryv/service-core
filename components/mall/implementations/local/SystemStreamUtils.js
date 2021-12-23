/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Utilities for querying stores
 */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { UserStreams } = require('mall/interfaces/DataStore');

const visibleStreamsTree = SystemStreamsSerializer.getReadable()
UserStreams.applyDefaults(visibleStreamsTree);

module.exports = {
  visibleStreamsTree
}