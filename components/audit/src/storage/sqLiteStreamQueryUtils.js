/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Transform queries for SQLite - to be run on 
 * @param {} streamQuery 
 */
exports.toSQLiteQuery = function toSQLiteQuery(streamQuery) {
  if (streamQuery == null) return null;
 
  if (streamQuery.length === 1) {
    return processBlock(streamQuery[0]);
  } else { // pack in $or
    return '(' + streamQuery.map(processBlock).join(') OR (') + ')';
  }
  
  function processBlock(block) {
    if (typeof block === 'string') return '"'+block+'"';
    let res = ''; // A OR B
    const anyExists = block.any && block.any.length > 0 && block.any[0] !== '*';
    if (anyExists) { 
      if (block.any.length === 1) {
        res += addQuotes(block.any)[0];
      } else {
        res += '(' + addQuotes(block.any).join(' OR ') + ')';
      }
    }
    if (block.and && block.and.length > 0) {
      if (anyExists) res+= ' AND ';
      const subs = block.and.map(processBlock);
      res +=  subs.join(' AND ');
    }
    if (block.not && block.not.length > 0) { 
      if (! anyExists) res += ' ".." ';
      res += ' NOT ';
      res += addQuotes(block.not).join(' NOT ');
    }
    if (res === '') res = null;
    return res ;
  }
}

function addQuotes(array) {
  return array.map((x) => '"'+x+'"');
}
