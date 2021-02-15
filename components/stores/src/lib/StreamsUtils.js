/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { DataSource } = require('../../interfaces/DataSource');
const LOCAL_STORE = 'local';

/**
 * Create a Stream object from a DataSource 
 * @param {DataSource} source 
 * @param {Object} extraProperties 
 */
function sourceToStream(source, extraProperties) {
  return Object.assign({
    id: source.id,
    name: source.name,
    parentId: null,
    created: DataSource.UNKOWN_DATE,
    modified: DataSource.UNKOWN_DATE,
    createdBy: DataSource.BY_SYSTEM,
    modifiedBy: DataSource.BY_SYSTEM,
  }, extraProperties);
}

/**
 * Get the sourceId related to this stream
 */
function sourceIdForStreamId(streamId) {
  if (streamId.indexOf('.') !== 0) return LOCAL_STORE;
  const dashPos = streamId.indexOf('-');
  return streamId.substr(1, (dashPos > 0) ? (dashPos - 1) : undefined); // fastest against regexp and split 40x
}


module.exports = {
  sourceToStream: sourceToStream,
  sourceIdForStreamId: sourceIdForStreamId
}