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
const _ = require('lodash');


/**
 * To allow retro-compatibility with stream querying
 * Replace globing [] by {OR: []}
 * Replace all strings 'A' by {IN: ['A',...childs]}
 * @param {Object} streamQuery 
 * @param {Function} expand should return the streamId in argument and its children (or null if does not exist).
 * @param {Function} registerStream should return true if stream exists.
 * @returns {Object} The streamQuery with sugar removed
 * @throws Error messages when structure is not valid.
 */
exports.removeSugarAndCheck = function removeSugarAndCheck(streamQuery, expand, registerStream) {

  return inspect(streamQuery);

  // utility that expand get the children for a command.
  function expandTo(operator, item, isInclusive) {
    // expand and removes eventual null objects from expand() 
    const expanded = expand(item, isInclusive);
    const filtered = expanded.filter((x) => { return x !== null });
    if (filtered.length === 0) return null;
    return { [operator]: filtered };
  }

  function inspect(streamQuery) {
    switch (typeof streamQuery) {
      case 'string': // A single streamId will be expanded to {'IN': '.., .., ...'}
        return expandTo('IN', streamQuery, true);

      case 'object':
        // This should be converter to a {OR: ..., ..., ...}
        if (Array.isArray(streamQuery)) { // already optimize here as its simple
          return inspect({ OR: streamQuery });
        }

        // This an object and should be a operator
        const [operator, value] = operatorToArray(streamQuery);
        let isInclusive = false;
        switch (operator) {
          // check if value if a streamId and keep
          case 'EQUAL':
            isInclusive = true;
          case 'NOTEQUAL':
            throwErrorIfNot(operator, 'string', value);
            if (!registerStream(value, isInclusive)) return null;
            return streamQuery; // all ok can be kept as-this
          // check if value if a streamId & expand to the corresponding operator
          case 'EXPAND': // To be transformed to 'IN'
            throwErrorIfNot(operator, 'string', value);
            return expandTo('IN', value, true);
          case 'NOTEXPAND': // To be transformed to 'NOTIN'
            throwErrorIfNot(operator, 'string', value);
            return expandTo('NOTIN', value, false);
          case 'NOT': // To be transformed to 'NOTIN'
            throwErrorIfNot(operator, 'array', value);
            const OR = [];
            value.map((v) => {
              if (typeof v !== 'string')
                throw ('Error in query, [' + operator + '] can only contains streamIds: ' + value);
              const res = expandTo('NOTIN', v, false);
              if (res && res.NOTIN.length > 0) OR.push(res);
            });
            return { OR: OR };
          case 'IN':
            isInclusive = true;
          case 'NOTIN':
            throwErrorIfNot(operator, 'array', value);
            const result = value.filter((v) => {
              if (typeof v !== 'string')
                throw ('Error in query, [' + operator + '] can only contains streamIds: ' + value);
              return registerStream(v, isInclusive);
            });
            return { [operator]: result }; // all ok can be kept as-this
          case 'AND':
          case 'OR':
            throwErrorIfNot(operator, 'array', value);
            const inspected = value.map(inspect);
            const candidate = inspected.filter((x) => { return x !== null });
            if (candidate === null || candidate.length === 0) return null;
            if (candidate.length === 1) return candidate[0];
            return { [operator]: candidate };
          default:
            throw ('Unkown selector [' + operator + '] in query: ' + JSON.stringify(streamQuery));
        };
      default:
        throw ('Unkown item [' + JSON.stringify(streamQuery) + ' ] in query: ');
    }
  }

  // utility to throw error if the value associated with the operator is not of expectedType
  function throwErrorIfNot(operator, expectedType, value) {
    let check = false;
    if (expectedType === 'array') {
      check = Array.isArray(value);
    } else { // 'string', 'object' ....
      check = (typeof value === expectedType);
    }
    if (!check) throw ('Error in query, [' + operator + '] can only be used with ' + expectedType + 's: ' + JSON.stringify(streamQuery));
  }
}


/**
 * Simplify a streamQuery by detecting some patterns and replacing them by a simpler version
 * TODO: In case of very deep complex or stupid structure ex. {AND: [{AND: [{IN: 'A'}]}]} mrProper should do several loops
 * @param {*} streamQuery 
 */
function mrProper(operator, value) {
  switch (operator) {
    // if (OR [IN a.., IN b.., EQUAL c] => IN unique([a.., b.., c]) )
    case 'OR': // value is an Array
      // concat all 'IN' and 'EQUAL' under an 'IN'.
      const IN = [];
      const NOTIN = []; // do the same for NOT and NOTEQUAL
      const OR = []; // or is the main older at the end
      value.map((item) => {
        const [key, v] = operatorToArray(item);
        switch (key) {
          case 'IN':
          case 'EQUAL':
            pushIfNotExists(IN, v);
            break;
          case 'NOTIN':
          case 'NOTEQUAL':
            pushIfNotExists(NOTIN, v);
            break;
          default:
            pushIfNotNull(OR, mrProper(key, v));
        }
      });

      pushIfNotNull(OR, mrProper('IN', IN));
      pushIfNotNull(OR, mrProper('NOTIN', NOTIN));

      if (OR.length === 1) return OR[0]; // only one operator we can skip the OR
      if (OR.length === 0) return null; // empty no need to keep it
      return { 'OR': OR }; // all clean
    case 'AND':
      const AND = [];
      value.map((item) => { // clean all items 
        const [key, v] = operatorToArray(item);
        pushIfNotNull(AND, mrProper(key, v));
      });
      if (AND.length === 1) return AND[0]; // there is only one operator we can skip the AND
      if (AND.length === 0) return null;
      return { 'AND': AND }; // all clean
    case 'IN':
      if (value.length === 1) return { EQUAL: value[0] }; // then it's an equal
      if (value.length === 0) return null;
      return { 'IN': value }; // all clean
    case 'NOTIN':
      if (value.length === 1) return { NOTEQUAL: value[0] }; // then it's a not equal
      if (value.length === 0) return null;
      return { 'NOTIN': value }; // all clean
    default:
      return { [operator]: value };
  }
}

/**
 * Transform queries for mongoDB - to be run on 
 * @param {} streamQuery 
 * @param {boolean} optimizeQuery 
 */
exports.toMongoDBQuery = function toMongoDBQuery(streamQuery, doNotOptimizeQuery) {
  if (!streamQuery) return null;
  if (!doNotOptimizeQuery) {
    const [operator, value] = operatorToArray(streamQuery);
    streamQuery = mrProper(operator, value);
  }
  return inspect(streamQuery);
  function inspect(item) {
    const [operator, value] = operatorToArray(item);
    switch (operator) {
      case 'EQUAL':
        return { streamIds: value };
      case 'NOTEQUAL':
        return { streamIds: { $ne: value } };
      case 'IN':
        return { streamIds: { $in: value } };
      case 'NOTIN':
        return { streamIds: { $nin: value } };
      case 'AND':
        return { $and: value.map(inspect) }
      case 'OR':
        return { $or: value.map(inspect) }
      default:
        throw ('Unkown operator [' + operator + '] in: ' + JSON.stringify(item));
    }
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