/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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

const { StreamsUtils } = require('stores');

/**
 * @typedef {Object} StreamQueryScoped
 * @property {Array.<StreamQuery>} streamQuery - An array of streamQueries 
 * @property {Array} nonAuthorizedStreams - The list of stream that have been unAuthorized 
 */

/**
 * @typedef {Object} StreamQuery
 * @property {Array.<StreamId>|'*'} any - Any of the streamIds should match or "*" for all accessible streams
 * @property {Array.<StreamId>} all - All of the streamIds should match
 * @property {Array.<StreamId>} not - All of the streamIds should match
 */

/**
  * A streamId
  * @typedef {string} StreamId
  */

/**
 * For retrocompatibility with older streams parameter ['A', 'B'] transform it to streams query [{any: ['A', 'B']}]
 * Takes care of grouping by store. ['A', 'B', '.audit-xx'] => [{any: ['A', 'B']}, {any: '.audit-xx'}]
 * @param {Array.<StreamQuery>} arrayOfQueries 
 * @throws - Error if mixed strings and other are found in array
 */
function transformArrayOfStringsToStreamsQuery(arrayOfQueries) {

  const streamIds = arrayOfQueries.filter(item => typeof item === 'string');

  if (streamIds.length === 0) return arrayOfQueries;

  if (streamIds.length != arrayOfQueries.length) {
    throw('Error in "streams" parameter: streams queries and streamIds cannot be mixed');
  }

  // group streamIds per "store"
  const map = {};
  for (let streamId of streamIds) {
    const [store, cleanStreamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId);
    if (! map[store]) map[store] = [];
    map[store].push(streamId);
  }

  const res = [];
  for (let v of Object.values(map)) {
    res.push({any: v});
  }

  return res;
}
module.exports.transformArrayOfStringsToStreamsQuery = transformArrayOfStringsToStreamsQuery;

/**
 * @param {Array.<StreamQuery>} arrayOfQueries 
 * @throws - Error if query does not respect the schema
 */
function validateStreamsQuery(arrayOfQueries) {
  arrayOfQueries.forEach((streamQuery) => { 
    validateStreamsQuerySchemaAndSetStore(arrayOfQueries, streamQuery); 
  });
}
/**
 * throw an error if streamQuery is not of the form {any: all: not: } with at least one of any or all 
 * [{any: ['A', 'B', '.email']}, {any: '.audit-xx'}] => [{any: ['A', 'B', '.email'], storeId: 'local'}, {any: 'xx', storeId: 'audit'}]
 * @param {Array.<StreamQuery>} arrayOfQueries - the full request for error message
 * @param {StreamQuery} streamQuery 
 */
function validateStreamsQuerySchemaAndSetStore(arrayOfQueries, streamQuery) {

  /**
   * Get StoreID, add storeId proerty to query and remove eventual storeId from streamId
   * @param {string} streamId 
   * @returns {string} streamId without storeId
   */
  function checkStore(streamId) {
    // queries must be grouped by store 
    const [thisStore, cleanStreamId] = StreamsUtils.storeIdAndStreamIdForStreamId(streamId);
    
    if (! streamQuery.storeId) streamQuery.storeId = thisStore;
    if (streamQuery.storeId !== thisStore) throw ('Error in "streams" parameter "' + objectToString(arrayOfQueries) + '" streams query: "' + objectToString(streamQuery) +'" queries must me grouped by stores.');
    return cleanStreamId;
  }

  if (! streamQuery.any && ! streamQuery.all) {
    throw ('Error in "streams" parameter "' + objectToString(arrayOfQueries) + '" streams query: "' + objectToString(streamQuery) +'" must contain at least one of "any" or "all" property.');
  }
  const res = {};
  for (const [property, arrayOfStreamIds] of Object.entries(streamQuery)) {
    if (! ['all', 'any', 'not'].includes(property))
      throw ('Error in "streams" parameter "' + objectToString(arrayOfQueries) + '" unkown property: "' + property +'" in streams query "' + objectToString(streamQuery) + '"');
  
    if (! Array.isArray(arrayOfStreamIds)) {
      if (property === 'any' && arrayOfStreamIds === '*') {
        checkStore('*'); // will be handled as local
        continue; // stop here and go to next property
      } else {
        throw ('Error in "streams" parameter "' + objectToString(arrayOfQueries) + '" value of : "' + property +'" must be an array. Found: "' + objectToString(arrayOfStreamIds) + '"' );
      }
    }

    const arrayOfCleanStreamIds = [];
    for (item of arrayOfStreamIds) {
      if (typeof item !== 'string')
        throw ('Error in "streams" parameter[' + objectToString(arrayOfQueries) + '] all items of ' + objectToString(arrayOfStreamIds) +' must be streamIds. Found: ' + objectToString(item) );
      const cleanStreamid = checkStore(item);
      arrayOfCleanStreamIds.push(cleanStreamid);
    }
    streamQuery[property] = arrayOfCleanStreamIds;
  }
}
exports.validateStreamsQuery = validateStreamsQuery;

/**
 * @callback CheckStream generic callback to get stream accesibility
 * @param {identifier} streamId
 * @return {boolean}
 */

 /**
 * @callback AllAccessibleStreamsForStore
 * @param {identifier} storeId
 * @return {Array.<StreamId>} allAccessibleStreams for local store
 */

 /**
 * @callback ExpandStream
 * @param {identifier} streamId
 * @param {identifier} storeId
 * @return {Array.<StreamId>|string} - returns all children recursively for this stream OR a proprietary string to be interpreted by events.get() in the streamQuery OR null if not expandable
 */


/**
 * @param {Array.<StreamQuery>} - array of streamQUeries 
 * @param {ExpandStream} expandStream returns all children recursively for this stream OR a proprietary string to be interpreted by events.get() in the streamQuery OR null if not expandable
 * @param {CheckStream} isAuthorizedStream - return true is this stream is Authorized
 * @param {CheckStream} isAccessibleStream - return true id this stream is Visible
 * @param {AllAccessibleStreamsForStore} allAccessibleStreamsForStore - the list of "visible" streams (i.e not trashed when state = default)
 * @returns {StreamQuery} 
 */
function checkPermissionsAndApplyToScope(arrayOfQueries, expandStream, isAuthorizedStream, isAccessibleStream, allAccessibleStreamsForStore) {
  
  // registerStream will collect all nonAuthorized streams here during streamQuery inspection
  const nonAuthorizedStreams = [];

  // inspect each streamQuery and remove enventual null
  const arrayOfQueriesResult = arrayOfQueries.map(expandAndTransformStreamQuery).filter((streamQuery) => { 
    return streamQuery !== null; // some streamQuery can be translated to "null" if no inclusion are found
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
  function expandAndTransformStreamQuery(streamQuery) {
    let containsAtLeastOneInclusion = false; 

    const res = { storeId: streamQuery.storeId };

    // any
    if (streamQuery.any) {
      if (streamQuery.any === '*') { 
        const allAccessibleStreams = allAccessibleStreamsForStore(streamQuery.storeId);
        if (allAccessibleStreams !== null && allAccessibleStreams.length > 0) {
          res.any = allAccessibleStreams;
          containsAtLeastOneInclusion = true;
        }
      } else {
        const expandedSet = expandSet(streamQuery.any, streamQuery.storeId);
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
          const expandedSet = expandSet([streamId], streamQuery.storeId);
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
   * @param {Array} streamIds - an array of streamids
   * @param {identifier} storeId - the relative storeId
   */
  function expandSet(streamIds, storeId) {
    const result = [];

    for (let streamId of streamIds) {
      if (streamId.startsWith('#')) { 
        addToResult(streamId.substr(1));
      } else {
        if (registerStream(streamId)) { 
          for (let expandedStream of expandStream(streamId, storeId)) { // expand can send "null" values
            if (expandedStream !== null) {
              addToResult(expandedStream)
            }
          }
        } 
      }
    }
    return result;

    function addToResult(streamId) {
      const ok = registerStream(streamId);
      if (ok && ! result.includes(streamId)) {
        result.push(streamId);
      }
      return ok;
    }

    /**
     * @param {string} streamId 
     * @returns {boolean} - true if streamId Can be used in the query
     */
    function registerStream(streamId) {
      if (! isAuthorizedStream(streamId)) { 
        nonAuthorizedStreams.push(streamId);
        return false;
      }
      return isAccessibleStream(streamId);
    }
  }
}
exports.checkPermissionsAndApplyToScope = checkPermissionsAndApplyToScope;

/**
 * Transform queries for mongoDB - to be run on 
 * @param {Array.<StreamQuery>} streamQueriesArray - array of streamQuery 
 * @param {Array.<StreamId>} forbiddenStreamsIds - an array of streamIds not accessible
 * @returns {MongoQuey} - the necessary components to query streams. Either with a {streamIds: ..} or { $or: ....}
 */
exports.toMongoDBQuery = function toMongoDBQuery(streamQueriesArray, forbiddenStreamsIds) {
  let mongoQuery = null; // no streams
  
  if (streamQueriesArray !== null) {
    if (streamQueriesArray.length === 1) {
      mongoQuery = streamQueryToMongoDBQuery(streamQueriesArray[0]);
    } else { // pack in $or
      mongoQuery =  {$or: streamQueriesArray.map(streamQueryToMongoDBQuery)};
    }
  }

  if (mongoQuery === null)  mongoQuery = {streamIds: {$in: []}}; // no streams

  if (forbiddenStreamsIds && forbiddenStreamsIds.length > 0) {
    mongoQuery.streamIds = mongoQuery.streamIds || {};
    if (mongoQuery.streamIds.$nin) {
      mongoQuery.streamIds.$nin.push(...forbiddenStreamsIds);
    } else {
      mongoQuery.streamIds.$nin = forbiddenStreamsIds;
    }
  }

  return mongoQuery;
}
/**
 * Convert a streamQuery to a query usable by MongoDB 
 * @param {StreamQuery} streamQuery 
 */
function streamQueryToMongoDBQuery(streamQuery) {
  const res = { };
  if (streamQuery.any && streamQuery.any.length > 0) { 
    if ( streamQuery.any.length === 1) {
      res.streamIds = { $eq: streamQuery.any[0]};
    } else {
      res.streamIds = { $in: streamQuery.any};
    }
  }
  // only reached from a "and" property
  if (streamQuery.not && streamQuery.not.length > 0) {
    if (res.streamIds) res.streamIds = {};
    if ( streamQuery.not.length === 1) {
      res.streamIds = { $ne: streamQuery.not[0] };
    } else {
      res.streamIds = { $nin : streamQuery.not};
    }
  }
  if (streamQuery.and) {
    res.$and = [];
    for (let andItem of streamQuery.and) {
      res.$and.push(streamQueryToMongoDBQuery(andItem));
    }
  }
  return res;
}

//------------------------ helpers ----------------------------------//

/** for nice error message with clear query content */
function objectToString(object) {
  return util.inspect(object, {depth: 5})
}