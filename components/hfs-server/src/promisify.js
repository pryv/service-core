'use strict';

/**
 * A simple meta function that allows turning async functions into promises
 * without the gore in your code. 
 *
 * Example: 
 * 
 *    const readFile = promisify(fs.readFile);
 *    readFile('name').then((data) => ...);
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
