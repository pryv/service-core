/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const assert = require('assert');
// Provides a static constructor '.wrap' that returns a proxy object wrapping a
// target. All calls  made to the proxy are forwarded to the target. If the
// target method throws an exception, it is  logged and rethrown.
//
// Example:
//
//    target.foo = () => console.log('yes');
//    target.bar = () => throw new Error('bar');
//    proxy = ErrorLogger.wrap(target);
//
//    proxy.foo();    // calls original foo, writes 'yes' to the console
//    proxy.bar();    // throws 'bar', logs "Uncaught error 'bar' during call to Object#bar."
//

class ErrorLogger {
  target;

  logger;
  /** @static
   * @param {T} target
   * @returns {any}
   */
  static wrap (target, logger) {
    // #get is expected to be invariant, but is covariant (because we're using
    // the 'class' syntax here).
    const handler = new ErrorLogger(target, logger);
    const proxy = new Proxy(target, handler);

    return proxy;
  }

  constructor (target, logger) {
    this.target = target;
    this.logger = logger;
  }

  /**
   * @param {T} target
   * @param {string} propKey
   * @returns {any}
   */
  get (target, propKey) {
    assert(target === this.target);

    // Whatever this results in, it will be what we want.
    const origValue = target[propKey];

    // If this is not a function, return it to the caller.
    if (typeof origValue !== 'function') return origValue;

    // Otherwise: Wrap the function with our exception handler.
    const origMethod = origValue;
    const wrapper = this;
    return function (...args) {
      try {
        const retval = origMethod.apply(this, args);
        if (retval && retval.catch != null) {
        // NOTE We return the original retval, not the return value from
        // catch here. This means that we fork the promise, returning the
        // original promise to the caller (and allow chaining off it) while
        // still _also_ attaching our handler here. It's not simple.
          retval.catch((err) => {
            wrapper.handleException(err, target, propKey);
          });
        }
        return retval;
      } catch (err) {
        wrapper.handleException(err, target, propKey);
        throw err;
      }
    };
  }

  /**
   * @param {Error} err
   * @param {T} target
   * @param {string} propKey
   * @returns {void}
   */
  handleException (err, target, propKey) {
    const logger = this.logger;
    logger.error(`Uncaught error: '${err.toString()}' during call to ${target.constructor.name}#${propKey}.`);
  }
}
module.exports = {
  ErrorLogger
};
