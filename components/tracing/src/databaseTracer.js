/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Patch a Database instance and to add tracing functions
 */

const { getHookedTracer } = require('./HookedTracer');
const { getConfigUnsafe } = require('@pryv/boiler');
const isTracingEnabled = getConfigUnsafe(true).get('trace:enable');

module.exports = function patch(db) {
  if (! isTracingEnabled) return;
  const functionsToPatch = getAllFuncs(db);
  for (const fInfo of functionsToPatch) {
    if (fInfo.id === 'getCollection' || fInfo.id === 'getCollectionSafe') continue; // ignores

    if (fInfo.params[0] === 'collectionInfo' && fInfo.params.includes('callback')) {
      const callbackIndex = fInfo.params.findIndex(e => 'callback' == e);
      db[fInfo.id + '_'] =  db[fInfo.id];

      // replace original function
      db[fInfo.id] = function() {
        const tracer = getHookedTracer('db:' + fInfo.id + ':' + arguments[0].name);
        arguments[callbackIndex] = tracer.finishOnCallBack(arguments[callbackIndex]);
        db[fInfo.id + '_'](...arguments);
      }
    }
  };
}

function getAllFuncs(toCheck) {
  const props = [];
  let obj = toCheck;
  do {
      props.push(...Object.getOwnPropertyNames(obj));
  } while (obj = Object.getPrototypeOf(obj));
  return props.sort().map((e, i, arr) => { 
     if (e!=arr[i+1] && typeof toCheck[e] == 'function') { 
       const params = getParamNames(toCheck[e]);
        return {id: e, params: params};
     }
     return null;
  }).filter(f => f != null);
}

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if(result === null)
     result = [];
  return result;
}
