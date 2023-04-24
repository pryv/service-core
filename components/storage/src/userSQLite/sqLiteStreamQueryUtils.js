/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { ALL_EVENTS_TAG } = require('./schemas/events');

/**
 * Transform queries for SQLite - to be run on
 * @param {} streamQuery
 */
exports.toSQLiteQuery = function toSQLiteQuery (streamQuery) {
  if (streamQuery == null) return null;

  if (streamQuery.length === 1) {
    return processAndBlock(streamQuery[0]);
  } else { // pack in $or
    return '(' + streamQuery.map(processAndBlock).join(') OR (') + ')';
  }

  function processAndBlock (andBlock) {
    if (typeof andBlock === 'string') return '"' + andBlock + '"';

    const anys = [];
    const nots = [];
    for (const andItem of andBlock) {
      if (andItem.any != null && andItem.any.length > 0) {
        if (andItem.any.indexOf('*') > -1) continue; // skip and with '*';
        if (andItem.any.length === 1) {
          anys.push(addQuotes(andItem.any)[0]);
        } else {
          anys.push('(' + addQuotes(andItem.any).join(' OR ') + ')');
        }
      } else if (andItem.not != null && andItem.not.length > 0) {
        nots.push(' NOT ' + addQuotes(andItem.not).join(' NOT '));
      } else {
        throw new Error('Go a query block with no any or not item ' + andBlock);
      }
    }

    if (anys.length === 0) {
      anys.push('"' + ALL_EVENTS_TAG + '"');
    }

    const res = anys.join(' AND ') + nots.join('');
    if (res === ALL_EVENTS_TAG) return null;
    return res;
  }
};

function addQuotes (array) {
  return array.map((x) => '"' + x + '"');
}
