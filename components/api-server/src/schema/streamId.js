/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * List of characters that are forbbidden in streamIds
 */
const forbiddenCharsMap = {
  '"': true,
  '\0': true,
  '\b': true,
  '\t': true,
  '\n': true,
  '\r': true,
  '\x1a': true,
  "'": true,
  '\\': true
};
/**
 * List of store prefixes
 */
const existingStoresMap = {
  ':system:': true,
  ':_system:': true,
  ':_audit:': true
};
const COLUMN = ':';
const STREAMID_AT_CREATION_REGEXP_STR = '^[a-z0-9-]{1,100}';
/**
 * Find forbidden character for 'streams' or 'permission.streamId'
 * @param {string} streamId
 * @returns {string}
 */
function findForbiddenChar (streamId) {
  for (let i = 0; i < streamId.length; i++) {
    const char = streamId[i];
    if (forbiddenCharsMap[char]) { return char; }
  }
  return null;
}
/**
 * Tests stream id for validity at creation
 * @param {string} streamId
 * @returns {boolean}
 */
function isStreamIdValidForCreation (streamId) {
  const regexp = new RegExp(STREAMID_AT_CREATION_REGEXP_STR);
  return regexp.test(streamId);
}
module.exports = {
  findForbiddenChar,
  isStreamIdValidForCreation,
  STREAMID_AT_CREATION_REGEXP_STR
};
