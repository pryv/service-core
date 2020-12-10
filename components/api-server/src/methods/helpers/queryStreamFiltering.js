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


/**
 * @typedef {Object} StreamQueryValidation
 * @property {Object} streamQuery - The query validated and expanded 
 * @property {Array} nonAuthorizedStreams - The list of stream that have been unAuthorized 
 */


/**
 * 
 */

function validateAndCoerceStreamQuery(arrayOfQueries) {
 

   // first extract all '<streamId>' for retrocompatibility and pack them into a single {any: ... }
   const streamIds = [];
   const filteredArrayOfQueries = arrayOfQueries.filter((item) => {
     if (typeof item === 'string') {
       streamIds.push(item); // pack all 'streamIds together'   {any: .., .., ..}
       return false;
     } 
     return true;
   });
   if (streamIds.length > 0 && filteredArrayOfQueries.length > 0) {
     throw('Error in query, streamQuery and streamIds cannot be mixed');
   }
   if (streamIds.length > 0) filteredArrayOfQueries.push({any: streamIds});
 
  // validateQUery
  filteredArrayOfQueries.forEach((streamQuery) => { checkStreamQuerySchema(filteredArrayOfQueries, streamQuery); });
  return filteredArrayOfQueries;
}

 /**
 * throw an error if block is not of the form {any: all: not: } with at least one of any or all 
 * @param {*} streamQuery 
 */
function checkStreamQuerySchema(requestQuery, streamQuery) {
  
  if (! streamQuery.any && ! streamQuery.all) {
    throw ('Error in query [' + objectToString(requestQuery) + '] item: [' + objectToString(streamQuery) +'] must contain at least one of "any" or "all" property');
  }
  const res = {};
  for (let property of Object.keys(streamQuery)) {
    if (! ['all', 'any', 'not'].includes(property))
      throw ('Error in query [' + objectToString(requestQuery) + '] unkown property: [' + property +'] in [' + objectToString(streamQuery) + ']');
  
    if (! Array.isArray(streamQuery[property])) {
      if (property === 'any' && streamQuery[property] === '*') {
        continue; // stop here and go to next property
      } else {
        throw ('Error in query [' + objectToString(requestQuery) + '] value of : [' + property +'] should be an array. Found: ' + objectToString(streamQuery[property]) );
      }
    }

    for (item of streamQuery[property]) {
      if (typeof item !== 'string')
        throw ('Error in query [' + objectToString(requestQuery) + '] all items of ' + objectToString(streamQuery[property]) +' should be streamIds. Found: ' + objectToString(item) );
    }
  }

}


exports.validateAndCoerceStreamQuery = validateAndCoerceStreamQuery;


/**
 * @param {Array} - streamQuery 
 * @param {Function} expand should return the streamId in argument and its children (or null if does not exist).
 * @param {Array} allAuthorizedStreams - the list of authorized streams
 * @param {Array} allAccessibleStreams - the list of "visible" streams (i.e not trashed when state = default)
 * @returns {StreamQueryValidation} 
 * @throws Error messages when structure is not valid.
 */
function validateStreamQuery(requestQuery, expand, allAuthorizedStreams, allAccessibleStreams) {
  
  const arrayOfQueries = validateAndCoerceStreamQuery(requestQuery);

  // registerStream will collect all nonAuthorized streams here during block inspection
  const nonAuthorizedStreams = [];

 

  // inspect each block and remove enventuall null
  const arrayOfQueriesResult = arrayOfQueries.map(expandAndTransformBlock).filter((block) => { 
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
   * { any: '*', and: [any: .. , any: ... , or: ...]
   * }
   * @param {Object} streamQuery 
   */
  function expandAndTransformBlock(streamQuery) {
    let containsAtLeastOneInclusion = false; 

    const res = { };

    // any
    if (streamQuery.any) {
      if (streamQuery.any === '*' && allAccessibleStreams.length > 0) {
        res.any = allAccessibleStreams;
        containsAtLeastOneInclusion = true;
      } else {
        const expandedSet = expandSet(streamQuery.any);
        if (expandedSet.length > 0) {
          containsAtLeastOneInclusion = true;
          res.any = expandedSet;
        }
      }
    }


    // all & not share the same logic
    for (const property of ['all', 'not']) {
      if (streamQuery[property]) {
        for (let streamId of streamQuery[property]) {
          const expandedSet = expandSet([streamId]);
          if (expandedSet.length > 0) {
            if (! res.and) res.and = [];
            let key = 'not';
            if (property === 'all') {
              containsAtLeastOneInclusion = true;
              key = 'any';
            } 
            res.and.push({[key]: expandedSet});
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

/** for nice error message with clear query content */
function objectToString(object) {
  return util.inspect(object, {depth: 5})
}