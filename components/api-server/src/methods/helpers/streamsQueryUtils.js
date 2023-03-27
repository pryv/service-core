/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
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
const { storeDataUtils } = require('mall');
const { findForbiddenChar } = require('../../schema/streamId');
/**
 * @typedef {Object} StreamQueryScoped
 * @property {Array.<StreamQuery>} streamQuery - An array of streamQueries
 * @property {Array} nonAuthorizedStreams - The list of stream that have been unAuthorized
 * @param {Array<any>} arrayOfQueries
 * @returns {any[]}
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
 * For backwardCompatibility with older streams parameter ['A', 'B'] transform it to streams query [{any: ['A', 'B']}]
 * Takes care of grouping by store. ['A', 'B', ':_audit:xx'] => [{any: ['A', 'B']}, {any: ':audit:xx'}]
 * @param {Array.<StreamQuery>} arrayOfQueries
 * @throws - Error if mixed strings and other are found in array
 */
function transformArrayOfStringsToStreamsQuery (arrayOfQueries) {
  const { numStreamIds, streamIds } = countStreamIds(arrayOfQueries);
  if (numStreamIds === 0) { return arrayOfQueries; }
  if (numStreamIds !== arrayOfQueries.length) {
    throw new Error("Error in 'streams' parameter: streams queries and streamIds cannot be mixed");
  }
  // group streamIds per "store"
  const map = {};
  for (const streamId of streamIds) {
    const [storeId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    if (map[storeId] == null) { map[storeId] = []; }
    map[storeId].push(streamId);
  }
  const arrayOfStreamQueries = [];
  for (const v of Object.values(map)) {
    arrayOfStreamQueries.push({ any: v });
  }
  return arrayOfStreamQueries;
  function countStreamIds (arrayOfQueries) {
    const streamIds = arrayOfQueries.filter((item) => typeof item === 'string');
    return {
      numStreamIds: streamIds.length,
      streamIds
    };
  }
}
exports.transformArrayOfStringsToStreamsQuery =
    transformArrayOfStringsToStreamsQuery;
/**
 * @param {Array<StreamQuery>} arrayOfQueries  undefined
 * @throws - Error if query does not respect the schema
 * @returns {any[]}
 */
function validateStreamsQueriesAndSetStore (arrayOfQueries) {
  arrayOfQueries.forEach((streamQuery) => {
    validateStreamsQuerySchemaAndSetStore(arrayOfQueries, streamQuery);
  });
  return arrayOfQueries;
}
exports.validateStreamsQueriesAndSetStore = validateStreamsQueriesAndSetStore;
/**
 * throw an error if streamQuery is not of the form {any: all: not: } with at least one of any or all
 * [{any: ['A', 'B', '.email']}, {any: ':_audit:xx'}] => [{any: ['A', 'B', '.email'], storeId: 'local'}, {any: 'xx', storeId: 'audit'}]
 * @param {Array<StreamQuery>} arrayOfQueries  - the full request for error message
 * @param {StreamQuery} streamQuery  undefined
 * @returns {void}
 */
function validateStreamsQuerySchemaAndSetStore (arrayOfQueries, streamQuery) {
  /**
   * Get StoreID, add storeId property to query and remove eventual storeId from streamId
   * @param {string} fullStreamId - a streamId with its store prefix
   * @returns {string} streamId without its prefix
   */
  function validateAndAttachStore (fullStreamId) {
    // queries must be grouped by store
    const [thisStoreId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(fullStreamId);
    if (streamQuery.storeId == null) { streamQuery.storeId = thisStoreId; }
    if (streamQuery.storeId !== thisStoreId) {
      throw new Error("Error in 'streams' parameter '" +
                objectToString(arrayOfQueries) +
                "' streams query: '" +
                objectToString(streamQuery) +
                "' queries must me grouped by store.");
    }
    return storeStreamId;
  }
  if (streamQuery.any == null) {
    throw new Error("Error in 'streams' parameter '" +
            objectToString(arrayOfQueries) +
            "' streams query: '" +
            objectToString(streamQuery) +
            "' must contain at least one of 'any' property.");
  }
  let hasAnyStar = false;
  for (const [property, arrayOfStreamIds] of Object.entries(streamQuery)) {
    if (!['all', 'any', 'not'].includes(property)) {
      throw new Error("Error in 'streams' parameter '" +
                objectToString(arrayOfQueries) +
                "' unknown property: '" +
                property +
                "' in streams query '" +
                objectToString(streamQuery) +
                "'");
    }
    if (!Array.isArray(arrayOfStreamIds)) {
      throw new Error("Error in 'streams' parameter '" +
                objectToString(arrayOfQueries) +
                "' value of : '" +
                property +
                "' must be an array. Found: '" +
                objectToString(arrayOfStreamIds) +
                "'");
    }
    const arrayOfCleanStreamIds = [];
    for (const item of arrayOfStreamIds) {
      if (typeof item !== 'string') {
        throw new Error("Error in 'streams' parameter[" +
                    objectToString(arrayOfQueries) +
                    '] all items of ' +
                    objectToString(arrayOfStreamIds) +
                    ' must be streamIds. Found: ' +
                    objectToString(item));
      }
      if (item === '#*') {
        throw new Error("Error in 'streams' parameter '" +
                    objectToString(arrayOfQueries) +
                    ', "#*" is not valid.');
      }
      const forbiddenChar = findForbiddenChar(item);
      if (forbiddenChar != null) {
        throw new Error("Error in 'streams' parameter '" +
                    objectToString(arrayOfQueries) +
                    "' forbidden chartacter '" +
                    forbiddenChar +
                    "' in streamId '" +
                    item +
                    "'.");
      }
      if (property !== 'any' && item === '*') {
        throw new Error("Error in 'streams' parameter[" +
                    objectToString(arrayOfQueries) +
                    "] only 'any' can contain '*' : " +
                    objectToString(arrayOfStreamIds));
      }
      if (property === 'any' && item === '*') {
        hasAnyStar = true;
        if (arrayOfStreamIds.length > 1) {
          throw new Error("Error in 'streams' parameter[" +
                        objectToString(arrayOfQueries) +
                        "] '*' cannot be mixed with other streamIds in 'any': " +
                        objectToString(arrayOfStreamIds));
        }
      }
      const cleanStreamid = validateAndAttachStore(item);
      arrayOfCleanStreamIds.push(cleanStreamid);
      streamQuery[property] = arrayOfCleanStreamIds;
    }
  }
  if (hasAnyStar && streamQuery.all != null) {
    throw new Error("Error in 'streams' parameter[" +
            objectToString(streamQuery) +
            "] {any: '*'} cannot be mixed with 'all': " +
            objectToString(arrayOfQueries));
  }
}
/**
 * @callback ExpandStream
 * @param {identifier} streamId
 * @param {identifier} storeId
 * @param {Array.<StreamId>} excludedIds - Array of streams to exclude from expand
 * @return {Array.<StreamId>|string} - returns all children recursively for this stream OR a proprietary string to be interpreted by events.get() in the streamQuery OR null if not expandable
 * @returns {unknown[]}
 */
function uniqueStreamIds (arrayOfStreamiIs) {
  return [...new Set(arrayOfStreamiIs)];
}
/**
 * @param {Array.<StreamQuery>} streamQueries
 * @param {ExpandStream} expandStream
 * @returns
 */
exports.expandAndTransformStreamQueries =
    async function expandAndTransformStreamQueries (streamQueries, expandStream) {
      async function expandSet (streamIds, storeId, excludedIds = []) {
        const expandedSet = new Set(); // use a Set to avoid duplicate entries;
        for (const streamId of streamIds) {
          // skip streamId presents in exluded set
          if (!excludedIds.includes(streamId)) {
            (await expandStream(streamId, storeId, excludedIds)).forEach((item) => expandedSet.add(item));
          }
        }
        return Array.from(expandedSet);
      }
      const res = [];
      for (const streamQuery of streamQueries) {
        const expandedQuery = await expandAndTransformStreamQuery(streamQuery, expandSet);
        if (expandedQuery) { res.push(expandedQuery); }
      }
      return res;
    };
/**
 * @returns {Promise<{ storeId: any; }>}
 */
async function expandAndTransformStreamQuery (streamQuery, expandSet) {
  let containsAtLeastOneInclusion = false;
  const res = { storeId: streamQuery.storeId };
  // any
  if (streamQuery.any) {
    const expandedSet = await expandSet(streamQuery.any, streamQuery.storeId, streamQuery.not);
    if (expandedSet.length > 0) {
      containsAtLeastOneInclusion = true;
      res.any = uniqueStreamIds(expandedSet);
    }
  }
  // all
  if (streamQuery.all) {
    for (const streamId of streamQuery.all) {
      const expandedSet = await expandSet([streamId], streamQuery.storeId, streamQuery.not);
      if (expandedSet.length === 0) { continue; } // escape
      if (!res.and) { res.and = []; }
      containsAtLeastOneInclusion = true;
      res.and.push({ any: uniqueStreamIds(expandedSet) });
    }
  }
  // not
  if (streamQuery.not) {
    const not = [];
    for (const streamId of streamQuery.not) {
      const expandedSet = await expandSet([streamId], streamQuery.storeId, streamQuery.any);
      if (expandedSet.length === 0) { continue; } // escape
      not.push(...expandedSet);
    }
    if (not.length > 0) {
      if (!res.and) { res.and = []; }
      res.and.push({ not: uniqueStreamIds(not) });
    }
  }
  return containsAtLeastOneInclusion ? res : null;
}
/**
 * Transform queries for MongoDB - to be run on
 * @param {Array.<StreamQuery>} streamQueriesArray - array of streamQuery
 * @returns {mongoQuery} - the necessary components to query streams. Either with a {streamIds: ..} or { $or: ....}
 */
exports.toMongoDBQuery = function toMongoDBQuery (streamQueriesArray) {
  let mongoQuery = null; // no streams
  if (streamQueriesArray !== null) {
    if (streamQueriesArray.length === 1) {
      mongoQuery = streamQueryToMongoDBQuery(streamQueriesArray[0]);
    } else {
      // pack in $or
      mongoQuery = { $or: streamQueriesArray.map(streamQueryToMongoDBQuery) };
    }
  }
  if (mongoQuery === null) { mongoQuery = { streamIds: { $in: [] } }; } // no streams
  return mongoQuery;
};
/**
 * Convert a streamQuery to a query usable by MongoDB
 * @param {StreamQuery} streamQuery
 * @returns {{}}
 */
function streamQueryToMongoDBQuery (streamQuery) {
  const res = {};
  if (streamQuery.any && streamQuery.any.length > 0) {
    if (!streamQuery.any.includes('*')) {
      // ignore queries that contains '*';
      if (streamQuery.any.length === 1) {
        res.streamIds = { $eq: streamQuery.any[0] };
      } else {
        res.streamIds = { $in: streamQuery.any };
      }
    }
  }
  // only reached from a "and" property
  if (streamQuery.not && streamQuery.not.length > 0) {
    if (res.streamIds) { res.streamIds = {}; }
    if (streamQuery.not.length === 1) {
      res.streamIds = { $ne: streamQuery.not[0] };
    } else {
      res.streamIds = { $nin: streamQuery.not };
    }
  }
  if (streamQuery.and) {
    res.$and = [];
    for (const andItem of streamQuery.and) {
      res.$and.push(streamQueryToMongoDBQuery(andItem));
    }
  }
  return res;
}
// ------------------------ helpers ----------------------------------//
/**
 * for nice error message with clear query content
 * @returns {any}
 */
function objectToString (object) {
  return util.inspect(object, { depth: 5 });
}
