/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');

/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Utilities for events.get stream queries.
 */


/**
 * To allow retro-compatibility with stream querying
 * Replace globing [] by {OR: []}
 * Replace all strings "A" by {IN: ['A',...childs]}
 * @param {*} streamQuery 
 */
exports.removeSugarAndCheck = function removeSugarAndCheck(streamQuery, expand, registerStream) {

    return inspect(streamQuery);

    function expandToIn(item) {
        const expanded = expand(item);
        if (expanded.length === 0) return null;
        return { IN: expand(item) };
    }

    function inspect(streamQuery) {
        switch (typeof streamQuery) {
            case 'string': // A single streamId will be expanded
                return expandToIn(streamQuery);

            case 'object':
                // Array are handled first
                if (Array.isArray(streamQuery)) {
                    // remove all 'null' elements from array
                    const filterdStreamQuery = streamQuery.filter((x) => { return x !== null });
                    if (filterdStreamQuery.length == 0) return null;
                    if (filterdStreamQuery.length == 1) { return inspect(filterdStreamQuery[0]); }
                    const orCandidate = filterdStreamQuery.map(inspect);
                    if (orCandidate === null || orCandidate.length === 0) return null;
                    return { OR: orCandidate };
                }

                // This should be a command
                const [command, value] = commandToArray(streamQuery);
                switch (command) {
                    case 'EQUAL': // can only be a string A terminaison
                    case 'NOTEQUAL':
                    case 'NOT':
                        if (typeof command !== 'string') throw ("Error in query, [" + command + "] can only be used with streamIds: " + streamQuery);
                        if (!registerStream(value)) return null;
                        return getCommand(command, value);
                    case 'EXPAND':
                        if (typeof command !== 'string') throw ("Error in query, [" + command + "] can only be used with streamIds: " + streamQuery);
                        return expandToIn(streamQuery);
                    case 'IN':
                        if (!Array.isArray(value)) throw ("Error in query, [" + command + "] can only be used with arrays: " + streamQuery);
                        value.map((v) => { 
                            if (typeof v !== 'string') 
                                throw ("Error in query, [" + command + "] can only contains streamIds: " + value);
                        });
                        return {IN: value};
                    case 'AND':
                    case 'OR':
                        if (!Array.isArray(value)) throw ("Error in query, [" + command + "] can only be used with arrays: " + streamQuery);
                        return getCommand(command, value.map(inspect));
                    default:
                        throw ("Unkown selector [" + command + "] in query: " + streamQuery);
                };
            default:
                throw ("Unkown item in query: " + item);
        }
    }
}


/**
 * Optimize query
 * @param {*} streamQuery 
 */
function mrProper(command, value) {
    switch (command) {
        // if (OR [IN a.., IN b.., EQUAL c] => IN unique([a.., b.., c]) )
        case 'OR': // value is an Array
            // concat all "IN" and "EQUAL" under an "IN".
            const IN = [];
            const NOT = []; // same for NOT and NOTEQUAL
            const OR = []; 
            value.map((item) => {
                const [key, v] = commandToArray(item);
                switch (key) {
                    case 'IN':
                    case 'EQUAL':    
                        pushIfNotExists(IN, v); 
                        break;
                    case 'NOT':
                    case 'NOTEQUAL':
                        pushIfNotExists(NOT, v);
                        break;
                    default:
                        pushIfNotNull(OR, mrProper(key, v));
                } 
            });
            
            pushIfNotNull(OR, mrProper('IN', IN));
            pushIfNotNull(OR, mrProper('NOT', NOT));
            
            if (OR.length === 1) { // only one command we can skip the OR
                return OR[0];
            }
            if (OR.length === 0) null;
            return {'OR': OR};
        case 'AND':
            const AND = [];
            value.map((item) => {
                const [key, v] = commandToArray(item);
                pushIfNotNull(AND, mrProper(key, v));
            });
            if (AND.length === 1) { // only one command we can skip the OR
                return AND[0];
            }
            if (AND.length === 0) null;
            return {'AND': AND};
        case 'IN':
            if (value.length === 0) return null;
            if (value.length === 1) return {EQUAL: value[0]}; // then it's an equal
            return {'IN': value}; // all clean
        case 'NOT':
            if (value.length === 0) return null;
            if (value.length === 1) return {NOTEQUAL: value[0]}; // then it's a not equal
            return {'NOT': value}; // all clean
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
            case 'NOT':
                return {streamIds: { $nin: value }};
            case 'AND':
                return { $and: value.map(inspect) }
            case 'OR':
                return { $or: value.map(inspect) }
            default:
                throw ("Unkown command [" + command + "] in: " + JSON.stringify(item));
        }
    }
}


//--- helpers --//

/** 
 * utility to create objects {command: value} 
 * */
function getCommand(command, value) {
    const res = {};
    res[command] = value;
    return res;
}


/**
 * Helper that add a string or array to an array if not present
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
 * Destructure commands {KEY: VALUE} => [KEY, VALUE] 
 * @param {object} command of the form {KEY: VALUE}
 */
function commandToArray(command) {
    const keys = Object.keys(command);
    if (keys.length < 1) throw ("Found an empty object in query");
    if (keys.length > 1) throw ("Found an object with more than one command in query: " + JSON.stringify(command));
    return [keys[0], command[keys[0]]];
}