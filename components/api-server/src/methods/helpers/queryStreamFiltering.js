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
 * @param {Array} - streamQuery 
 * @param {Function} expand should return the streamId in argument and its children (or null if does not exist).
 * @param {Array} allAuthorizedStreams - the list of authorized streams
 * @param {Array} allAccessibleStreams - the list of "visible" streams (i.e not trashed when state = default)
 * @returns {StreamQueryValidation} 
 * @throws Error messages when structure is not valid.
 */
function validateStreamQuery(streamQuery, expand, allAuthorizedStreams, allAccessibleStreams) {
  
  const arrayOfQueries = coerceToStreamQuery(streamQuery);

  // registerStream will collect all nonAuthorized streams here during block inspection
  const nonAuthorizedStreams = [];

  // inspect each block and remove enventuall null
  const arrayOfQueriesResult = arrayOfQueries.map(inspectBlock).filter((block) => { 
    return block !== null; // some block can be translated to "null" if no inclusion are found
  });

  if (arrayOfQueriesResult.length === 0) {
    return {
      nonAuthorizedStreams: nonAuthorizedStreams,
      streamQuery: null // means no scope
    }
  }

  return {
    nonAuthorizedStreams: nonAuthorizedStreams,
    streamQuery: arrayOfQueriesResult
  }
  
  /**
   * throw an error if block is not of the form {any: all: not: } with at least one of any or all 
   * @param {*} block 
   */
  function inspectBlock(block) {
    let containsAtLeastOneInclusion = false; 
    if (! block.any && ! block.all) {
      throw ('Error in query [' + objectToString(streamQuery) + '] item: [' + objectToString(block) +'] must contain at least one of "any" or "all" property');
    }
    const res = {};
    for (let property of Object.keys(block)) {
      if (! ['all', 'any', 'not'].includes(property))
        throw ('Error in query [' + objectToString(streamQuery) + '] unkown property: [' + property +'] in [' + objectToString(block) + ']');
    
      if (! Array.isArray(block[property])) {
        if (property === 'any' && block[property] === '*' && allAccessibleStreams.length > 0) {
          res.any = allAccessibleStreams;
          containsAtLeastOneInclusion = true;
          continue; // stop here and go to next property
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
          containsAtLeastOneInclusion = true;
          res[property] = expandedSet;
        }
      } else { 
        // 'all' must be converted in {and: [{any: [], any: []}]}
        // 'not' must be converted in {and: [{not: [], not: []}]}
        if (! res.and) res.and = [];
        for (let streamId of block[property]) {
          const expandedSet = expandSet([streamId]);
          if (expandedSet.length > 0) {
            if (property === 'all') {
              containsAtLeastOneInclusion = true;
              res.and.push({any: expandedSet});
            } else { // not
              res.and.push({not: expandedSet});
            }
            
          }
        }
      }
    }
    return (containsAtLeastOneInclusion) ? res : null;
  }

  /**
   * uses allAuthorizedStreams and allAccessibleStreams to check if it can be used in query
   * @param {string} streamId 
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
 * 
 * @param {streamQuery} array - of streamIds or streamQuery
 */
function coerceToStreamQuery(streamQuery) {
   // first extract all '<streamId>' for retrocompatibility and pack them into a single {any: ... }
   const streamIds = [];
   const filteredQuery = streamQuery.filter((item) => {
     if (typeof item === 'string') {
       streamIds.push(item); // pack all 'streamIds together'   {any: .., .., ..}
       return false;
     } 
     return true;
   });
   if (streamIds.length > 0 && filteredQuery.length > 0) {
     throw('Error in query, streamQuery and streamIds cannot be mixed');
   }
   if (streamIds.length > 0) filteredQuery.push({any: streamIds});
 
   return filteredQuery;
}
