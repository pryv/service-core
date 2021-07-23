
const { getHookedTracer } = require('tracing');

module.exports = function patch(db) {
  const functionsToPatch = getAllFuncs(db);
  for (const fInfo of functionsToPatch) {
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
