// @flow

const assert = require('assert');

import type { Logger } from 'components/utils';

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
    
    if (typeof origValue !== 'function') return origValue;
    
    const origMethod = origValue;
    const logger = this.logger; 
    return function (...args: Array<mixed>) {
      try {
        return origMethod.apply(this, args);
      }
      catch (err) {
        logger.error(`Uncaught error: '${err}' during call to ${target.constructor.name}#${propKey}.`);
      }
    };
  }
}

module.exports = {
  ErrorLogger,
};