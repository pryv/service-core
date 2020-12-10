/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Utilities for events.get stream queries.
 * 
 * Documentation and specifications can be found on 
 * https://github.com/pryv/docs-pryv/blob/master/pryv.io/events.get-filtering/README.md
 */

const { prop } = require('ramda');
const util = require('util');
/** for nice error message with clear query content */
function objectToString(object) {
  return util.inspect(object, {depth: 5})
}

/**
 * @typedef {Object} StreamQueryValidation
 * @property {Object} streamQuery - The query validated and expanded 
 * @property {Array} nonAuthorizedStreams - The list of stream that have been unAuthorized 
 */


/**
 * To allow retro-compatibility with stream querying
 * Replace globing [] by {OR: []}
 * Replace all strings 'A' by {IN: ['A',...childs]}
 * @param {Object} streamQuery 
 * @param {Function} expand should return the streamId in argument and its children (or null if does not exist).
 * @param {Array} allAuthorizedStreams - the list of authorized streams
 * @param {Array} allAccessibleStreams - the list of "visible" streams (i.e not trashed when state = default)
 * @returns {StreamQueryValidation} 
 * @throws Error messages when structure is not valid.
 */
function validateStreamQuery(streamQuery, expand, allAuthorizedStreams, allAccessibleStreams) {
  console.log('XXXXX', streamQuery);
 
  if (! Array.isArray(streamQuery)) streamQuery = [streamQuery];

  const nonAuthorizedStreams = [];

  // first extract all '<streamId>' for retrocompatibility and pack them into a single {any: ... }
  const streamIds = [];
  const filteredQuery = streamQuery.filter((item) => {
    if (typeof item === 'string') {
      streamIds.push(item); // pack all 'streamIds together'   
      return false;
    } 
    return true;
  });
  if (streamIds.length > 0) filteredQuery.push({any: streamIds});

  // inspect each block and remove enventuall null
  const resultQuery = filteredQuery.map(inspectBlock);

  console.log('YYYY', nonAuthorizedStreams, resultQuery);
  return {
    nonAuthorizedStreams: nonAuthorizedStreams,
    streamQuery: resultQuery
  }
  
  /**
   * throw an error if block is not of the form {any: all: not: } with at least one of any or all 
   * @param {*} block 
   */
  function inspectBlock(block) {
    if (! block.any && ! block.all) {
      throw ('Error in query [' + objectToString(streamQuery) + '] item: [' + objectToString(block) +'] must contain at least one of "any" or "all" property');
    }
    const res = {};
    for (let property of Object.keys(block)) {
      if (! ['all', 'any', 'not'].includes(property))
        throw ('Error in query [' + objectToString(streamQuery) + '] unkown property: [' + property +'] in [' + objectToString(block) + ']');
    
      if (! Array.isArray(block[property])) {
        if (property === 'any' && block[property] === '*') {
          res.any = allAccessibleStreams;
          continue;
        } else {
          throw ('Error in query [' + objectToString(streamQuery) + '] value of : [' + property +'] should be an array. Found: ' + objectToString(block[property]) );
        }
      }

      for (item of block[property]) {
        if (typeof item !== 'string')
          throw ('Error in query [' + objectToString(streamQuery) + '] all items of ' + objectToString(block[property]) +' should be streamIds. Found: ' + objectToString(item) );
      }

      if (property === 'any') {
        const expandedSet = expandSet(block[property]);
        if (expandedSet.length > 0) {
          res[property] = expandedSet;
        }
      } else { 
        // 'all' must be converted in {and: [{any: [], any: []}]}
        // 'not' must be converted in {and: [{not: [], not: []}]}
        if (! res.and) res.and = [];
        for (let streamId of block[property]) {
          const expandedSet = expandSet([streamId]);
          if (expandedSet.length > 0) {
            const key = (property === 'all') ? 'any' : 'not';
            res.and.push({[key]: expandedSet})
          }
        }
      }
    }
    return res;
  }

  /**
   * uses isAuthorizedStream() and isAccessibleStream() to check if it can be used in query
   * @param {string} streamId 
   * @param {boolean} isInclusive - set to True is this is an "inclusive" selector (IN; EQUAL) - 
   * If a query does not include any "inclusive" scope, it means that it's only a "negative" scoping, 
   * then we should add the accessible streams as initial scope. To avoid exposing not visible streams content.
   * Example: {NOT ['A']} would be be translated to {AND: [{IN: [..all visible streams..], {NOTIN: 'A'} ]}
   * @returns {boolean} - true is streamId Can be used in the query
   */
  function registerStream(streamId) {
    const isAuthorized = allAuthorizedStreams.includes(streamId);
    if (! isAuthorized) { 
      nonAuthorizedStreams.push(streamId);
      return false;
    }
    const isAccessible = allAccessibleStreams.includes(streamId);
    if (! isAccessible) return false;
    return true;
  }


  /**
   * @param {Array} streamIds - an array of streamids
   */
  function expandSet(streamIds) {
    const result = [];

    function addToResult(streamId) {
      const ok = registerStream(streamId);
      if (ok && ! result.includes(streamId)) {
        result.push(streamId);
      }
      return ok;
    }

    for (let streamId of streamIds) {
      if (streamId.startsWith('#')) { 
        addToResult(streamId.substr(1));
      } else {
        if (registerStream(streamId)) { 
          for (let expandedStream of expand(streamId)) { // expand can send "null" values
            if (expandedStream !== null) {
              addToResult(expandedStream)
            }
          }
        } 
      }
    }
    return result;
  }
}

exports.validateStreamQuery = validateStreamQuery;


/**
 * Transform queries for mongoDB - to be run on 
 * @param {Object} streamQuery 
 * @returns {Object} - the necessary components to query streams. Either with a {streamIds: ..} or { $or: ....}
 */
exports.toMongoDBQuery = function toMongoDBQuery(streamQuery, optimizeQuery = true) {
  if (!streamQuery) return null;
  
  if (streamQuery.length === 1) {
    return processBlock(streamQuery[0]);
  } else { // pack in $or
    return {$or: streamQuery.map(processBlock)};
  }

  
  function processBlock(block) {
    const res = { };
    if (block.any && block.any.length > 0) { 
      if ( block.any.length === 1) {
        res.streamIds = { $eq: block.any[0]};
      } else {
        res.streamIds = { $in: block.any};
      }
    }
    // only reached from a "and" block
    if (block.not && block.not.length > 0) {
      if (res.streamIds) res.streamIds = {};
      if ( block.not.length === 1) {
        res.streamIds = { $ne: block.not[0] };
      } else {
        res.streamIds = { $nin : block.not};
      }
    }
    if (block.and) {
      res.$and = [];
      for (let andItem of block.and) {
        res.$and.push(processBlock(andItem));
      }
    }
    return res;
  }


}

//------------------------ helpers ----------------------------------//


/**
 * Helper that adds a string or array to an array if not present
 * @param {} array 
 * @param {string|array} value 
 */
function pushIfNotExists(array, value) {
  if (typeof value === 'string') value = [value];
  for (let i = 0; i < value.length; i++) {
    if (array.indexOf(value[i]) === -1) array.push(value[i]);
  }
}

/**
 * Helper that and an item to an array if not present
 * @param {} array 
 * @param {*} value 
 */
function pushIfNotNull(array, value) {
  if (value !== null) array.push(value);
}

/**
 * Decompose operators {KEY: VALUE} => [KEY, VALUE] 
 * @param {object} operator of the form {KEY: VALUE}
 */
function operatorToArray(operator) {
  const keys = Object.keys(operator);
  if (keys.length < 1) throw ('Found an empty object in query');
  if (keys.length > 1) throw ('Found an object with more than one operator in query: ' + JSON.stringify(operator));
  return [keys[0], operator[keys[0]]];
}