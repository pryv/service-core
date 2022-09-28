/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

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
  '\'': true,
  '\\': true,
};

/**
 * List of store prefixes
 */
const existingStoresMap = {
  ':system:': true,
  ':_system:': true,
  ':_audit:': true,
}

const COLUMN: string = ':';

const STREAMID_AT_CREATION_REGEXP_STR: string = '^[a-z0-9-]{1,100}';

/**
 * Find forbidden character for 'streams' or 'permission.streamId'
 */
function findForbiddenChar(streamId: string): ?string {
  for (let i=0; i<streamId.length; i++) {
    const char = streamId[i];
    if (forbiddenCharsMap[char]) return char;
  }
  return null;
}

/**
 * Tests stream id for validity at creation
 */
function isStreamIdValidForCreation(streamId: string): boolean {
  const regexp: RegExp = new RegExp(STREAMID_AT_CREATION_REGEXP_STR); 
  return regexp.test(streamId);
}



module.exports = {
  findForbiddenChar,
  isStreamIdValidForCreation,
  STREAMID_AT_CREATION_REGEXP_STR,
};