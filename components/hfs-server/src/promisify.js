'use strict';

/**
 * A simple meta function that allows turning async functions into promises
 * without the gore in your code. 
 *
 * Example: 
 * 
 *     const readFile = promisify(fs.readFile);
 *     readFile('name').then((data) => ...);
 * 
 * @param nodeAsyncFn {Function} Asynchronous function that has a callback as 
 *    its last argument. 
 * @param [context] {null|Object} Context the call must be placed in. Pass `this`
 *    for instance methods, otherwise you may leave this off and implicitly 
 *    pass `null`.
 * @return {Function} A function that has no callback argument, instead it will
 *    return a promise for the `res` argument that was part of the callback. 
 *    The promise resolves once the callback is called. 
 */
function promisify(nodeAsyncFn, context) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      args.push(function(err, val) {
        if (err) {
          return reject(err);
        }

        return resolve(val);
      });

      nodeAsyncFn.apply(context, args);
    });
  };
}

module.exports = promisify;
