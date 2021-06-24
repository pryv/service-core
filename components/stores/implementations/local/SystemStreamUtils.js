/**
 * Utilities for querying stores
 */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { UserStreams } = require('stores/interfaces/DataSource');

const forbiddenForReadingStreamIds = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForReading();

const visibleStreamsTree = SystemStreamsSerializer.getReadable()
UserStreams.applyDefaults(null, visibleStreamsTree);

module.exports = {
  visibleStreamsTree,
  forbiddenForReadingStreamIds
}