/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Transform queries for SQLite - to be run on 
 * @param {} streamQuery 
 */
exports.toSQLiteQuery = function toSQLiteQuery(streamQuery) {
  if (!streamQuery) return null;
  

  if (streamQuery.length === 1) {
    return processBlock(streamQuery[0]);
  } else { // pack in $or
    return '(' + streamQuery.map(processBlock).join(') OR (') + ')';
  }
  
  function processBlock(block) {
    let res = ''; // A OR B
    const orExists = block.any && block.any.length > 0 && block.any[0] !== '*';
    if (orExists) { 
      if (block.any.length === 1) {
        res += addQuotes(block.any)[0];
      } else {
        res += '(' + addQuotes(block.any).join(' OR ') + ')';
      }
    }
    if (block.all && block.all.length > 0) {
      if (orExists) res+= ' AND ';
      res +=  addQuotes(block.all).join(' AND ');
    }
    if (block.not && block.not.length > 0) { 
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
