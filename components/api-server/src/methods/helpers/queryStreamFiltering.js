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

    function getCommand(command, value) {
        const res = {};
        res[command] = value;
        return res;
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
                const keys = Object.keys(streamQuery);
                if (keys.length < 1) throw ("Found an empty object in query");
                if (keys.length > 1) throw ("Found an object with more than one command in query: " + JSON.stringify(streamQuery));

                const command = keys[0];
                const value = streamQuery[command];
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


exports.toMongoDBQuery = function toMongoDBQuery(streamQuery) {
    return inspect(streamQuery);
    function inspect(item) {
        const keys = Object.keys(item);
        if (keys.length !== 1) throw ("Invalid base query: " + item);
        const command = keys[0];
        const value = item[command];
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