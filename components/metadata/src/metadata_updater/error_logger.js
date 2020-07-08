/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const assert = require('assert');

import type { Logger } from 'components/utils';

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
class ErrorLogger<T: Object> {
  target: T; 
  logger: Logger; 
  
  static wrap(target: T, logger: Logger): T {
    // #get is expected to be invariant, but is covariant (because we're using
    // the 'class' syntax here).
    // FLOW 
    const handler = new ErrorLogger(target, logger);
    const proxy = new Proxy(target, handler);
    
    return proxy; 
  }
  
  constructor(target: T, logger: Logger) {
    this.target = target;
    this.logger = logger; 
  }
  
  get(target: T, propKey: string) {
    assert(target === this.target);
    
    // FLOW Whatever this results in, it will be what we want.
    const origValue = target[propKey];

    // If this is not a function, return it to the caller. 
    if (typeof origValue !== 'function') return origValue;
    
    // Otherwise: Wrap the function with our exception handler. 
    const origMethod = origValue;
    const wrapper = this; 
    return function (...args: Array<mixed>) {
      try {
        const retval = origMethod.apply(this, args);
        
        if (retval && retval.catch != null) 
          // NOTE We return the original retval, not the return value from 
          // catch here. This means that we fork the promise, returning the 
          // original promise to the caller (and allow chaining off it) while
          // still _also_ attaching our handler here. It's not simple. 
          retval.catch(err => {
            wrapper.handleException(err, target, propKey);
          });
        
        return retval;
      }
      catch (err) {
        wrapper.handleException(err, target, propKey);
        throw err;
      }
    };
  }
  
  handleException(err: Error, target: T, propKey: string) {
    const logger = this.logger; 
    logger.error(`Uncaught error: '${err.toString()}' during call to ${target.constructor.name}#${propKey}.`);
  }
}

module.exports = {
  ErrorLogger,
};