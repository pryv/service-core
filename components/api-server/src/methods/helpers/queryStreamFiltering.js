/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Utilities for events.get stream queries.
 *

 ## Sugar

- a simple array `streamIds: ['A','B']` 
  will be converted in `streamIds:{OR: [{EXPAND: "A"}, {EXPAND: "B"}]}`

##Selectors

- On single streamId
  - `{EQUAL: "streamid"}` One the event's streamIds must be equal to `streamId`
  - `{NOTEQUAL: "streamid"}` None of the event's streamIds must be equal to `streamId`
  - `{EXPAND: "streamid"}` One the event's streamIds must be equal to `streamId` or one of it's childrens
    - This is converted to `{IN: ["streamId", "child1", "child2"]}` or
      `{EQUAL: "streamId"}` if streamId has no child.
  - `{NOTEXPAND: "streamid"}` None of the event's streamIds must be equal to `streamId` or one of it's childrens. 
    - This is converted to `{NOTIN: ["streamId", "child1", "child2"]}` or
      `{NOTEQUAL: "streamId"}` if streamId has no child.
- On multiple streamIds
  - `{IN: ["streamId1", "streamId2", ... ]}` One the event's streamIds must be equal to `streamId1` or `streamId2`, ...
  - `{NOTIN: ["streamId1", "streamId2", ... ]}` None of the event's streamIds must be equal to `streamId1` or `streamId2`, ...

##Aggregators

- `{OR: [selector1, selector2, ...]}` Any of the selector should be satisfied
- `{ALL: [selector1, selector2, ...]}` All of the selector must be satisfied

 */
const _ = require('lodash');


/**
 * To allow retro-compatibility with stream querying
 * Replace globing [] by {OR: []}
 * Replace all strings 'A' by {IN: ['A',...childs]}
 * @param {Object} streamQuery 
 * @param {Function} expand should return the streamId in argument and it's children (or null if does not exist).
 * @param {Function} registerStream should return true if stream exists.
 * @returns {Object} The streamQuery with sugar removed
 * @throws Error messages when structure is not valid.
 */
exports.removeSugarAndCheck = function removeSugarAndCheck(streamQuery, expand, registerStream) {

    return inspect(streamQuery);

    // utility that expand get the childrens for a command.
    function expandTo(command, item) {
        const expanded = expand(item);
        if (expanded.length === 0) return null;
        return getCommand(command, expanded);
    }

    function inspect(streamQuery) {

        switch (typeof streamQuery) {
            case 'string': // A single streamId will be expanded to {'IN': '.., .., ...'}
                return expandTo('IN', streamQuery);

            case 'object':
                // This should be converter to a {OR: ..., ..., ...}
                if (Array.isArray(streamQuery)) {
                    // remove all 'null' elements from array (null can comme from 'expand')
                    const filteredStreamQuery = streamQuery.filter((x) => { return x !== null });
                    if (filteredStreamQuery.length == 0) return null; // if empty array return null; 
                    // if OR as just one item we ignore it and directy return it's content
                    if (filteredStreamQuery.length == 1) { return inspect(filteredStreamQuery[0]); } 

                    const orCandidate = filteredStreamQuery.map(inspect);
                    if (orCandidate === null || orCandidate.length === 0) return null;
                    return { OR: orCandidate };
                }

                // This an object and should be a command
                const [command, value] = commandToArray(streamQuery);
                switch (command) {
                    // check if value if a streamId
                    case 'EQUAL': 
                    case 'NOTEQUAL':
                        throwErrorIfNot(command, 'string', value);
                        if (! registerStream(value)) return null;
                        return streamQuery; // all ok can be kept as-this
                    // check if value if a streamId & expand to the corresponding command
                    case 'EXPAND': 
                        throwErrorIfNot(command, 'string', value); 
                        return expandTo('IN', value);
                    case 'NOTEXPAND': 
                        throwErrorIfNot(command, 'string', value); 
                        return expandTo('NOTIN', value);
                    case 'IN': 
                    case 'NOTIN': 
                        throwErrorIfNot(command, 'array', value);
                        value.map((v) => { 
                            if (typeof v !== 'string') 
                                throw ('Error in query, [' + command + '] can only contains streamIds: ' + value);
                            registerStream(v);
                        });
                        return streamQuery; // all ok can be kept as-this
                    case 'AND':
                    case 'OR':
                        throwErrorIfNot(command, 'array', value);
                        return getCommand(command, value.map(inspect));
                    default:
                        throw ('Unkown selector [' + command + '] in query: ' + JSON.stringify(streamQuery));
                };
            default:
                throw ('Unkown item [' + JSON.stringify(streamQuery) +' ] in query: ');
        }
    }

    // utility to throw error if the value associated with the command is not of expectedType
    function throwErrorIfNot(command, expectedType, value) {
        let check = false;
        if (expectedType === 'array') {
            check = Array.isArray(value);
        } else { // 'string', 'object' ....
            check = (typeof value === expectedType);
        }
        if (! check) throw ('Error in query, [' + command + '] can only be used with ' + expectedType + 's: ' + JSON.stringify(streamQuery));
    }
}


/**
 * Simplify a streamQuery by detecting some patterns and replacing them by a simpler version
 * TODO: In case of very deep complex or stupid structure ex. {AND: [{AND: [{IN: 'A'}]}]} mrProper should do several loops
 * @param {*} streamQuery 
 */
function mrProper(command, value) {
    switch (command) {
        // if (OR [IN a.., IN b.., EQUAL c] => IN unique([a.., b.., c]) )
        case 'OR': // value is an Array
            // concat all 'IN' and 'EQUAL' under an 'IN'.
            const IN = [];
            const NOTIN = []; // do the same for NOT and NOTEQUAL
            const OR = []; // or is the main older at the end
            value.map((item) => {
                const [key, v] = commandToArray(item);
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
            
            if (OR.length === 1) return OR[0]; // only one command we can skip the OR
            if (OR.length === 0) return null; // empty no need to keep it
            return {'OR': OR}; // all clean
        case 'AND':
            const AND = [];
            value.map((item) => { // clean all items 
                const [key, v] = commandToArray(item);
                pushIfNotNull(AND, mrProper(key, v));
            });
            if (AND.length === 1) return AND[0]; // there is only one command we can skip the AND
            if (AND.length === 0) return null;
            return {'AND': AND}; // all clean
        case 'IN':
            if (value.length === 1) return {EQUAL: value[0]}; // then it's an equal
            if (value.length === 0) return null;
            return {'IN': value}; // all clean
        case 'NOTIN':
            if (value.length === 1) return {NOTEQUAL: value[0]}; // then it's a not equal
            if (value.length === 0) return null;
            return {'NOTIN': value}; // all clean
        default:
            return getCommand(command, value);
    }
}

/**
 * Transform queries for mongoDB - to be run on 
 * @param {} streamQuery 
 * @param {boolean} optimizeQuery 
 */
exports.toMongoDBQuery = function toMongoDBQuery(streamQuery, doNotOptimizeQuery) {
    if (! doNotOptimizeQuery) {
        const [command, value] =  commandToArray(streamQuery);
        streamQuery = mrProper(command, value);
    }
    return inspect(streamQuery);
    function inspect(item) {
        const [command, value] = commandToArray(item);
        switch (command) {
            case 'EQUAL':
                return {streamIds: value };
            case 'NOTEQUAL':
                return {streamIds: { $ne: value }};
            case 'IN':
                return {streamIds: {$in: value }};
            case 'NOTIN':
                return {streamIds: { $nin: value }};
            case 'AND':
                return { $and: value.map(inspect) }
            case 'OR':
                return { $or: value.map(inspect) }
            default:
                throw ('Unkown command [' + command + '] in: ' + JSON.stringify(item));
        }
    }
}

//------------------------ helpers ----------------------------------//

/** 
 * utility to create objects {command: value} 
 * */
function getCommand(command, value) {
    const res = {};
    res[command] = value;
    return res;
}

/**
 * Helper that adds a string or array to an array if not present
 * @param {} array 
 * @param {string|array} value 
 */
function pushIfNotExists(array, value) {
    if (typeof value === 'string') value = [value];
    for (let i = 0; i < value.length; i++) {
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
 * Decompose commands {KEY: VALUE} => [KEY, VALUE] 
 * @param {object} command of the form {KEY: VALUE}
 */
function commandToArray(command) {
    const keys = Object.keys(command);
    if (keys.length < 1) throw ('Found an empty object in query');
    if (keys.length > 1) throw ('Found an object with more than one command in query: ' + JSON.stringify(command));
    return [keys[0], command[keys[0]]];
}