// @flow

const bluebird = require('bluebird');

class Waiter {
  promise: Promise<void>;
  resolve: () => void; 
  reject: (err: Error) => void; 
  timeout: ?number;
  
  done: boolean; 
  
  constructor(timeout?: number) {
    this.done = false; 
    
    this.promise = new bluebird((res, rej) => {
      this.resolve = res; 
      this.reject = rej;
      
      if (timeout != null && timeout > 0) {
        this.timeout = setTimeout(() => this.timeoutFired(), timeout);
      }
    });
  }
  
  timeoutFired() {
    this.reject(
      new Error('timeout'));
  }
  
  release() {
    if (this.done) throw new Error('AF: waiter is not released');
    this.done = true; 
    
    this.resolve(); 
  }
}
class ConditionVariable {
  waiters: Array<Waiter>;
  
  constructor() {
    this.waiters = []; 
  }
  
  wait(timeout?: number): Promise<void> {
    const waiter = new Waiter(timeout);
      
    this.waiters.push(waiter);
    
    return waiter.promise; 
  }
  
  broadcast() {
    const list = this.waiters; 
    
    // release this reference before broadcasting; this avoids somehow
    // broadcasting twice during the first broadcast. 
    this.waiters = []; 
    
    for (const waiter of list) {
      waiter.release(); 
    }
  }
}

// A fuse that can be burnt once. As long as it is not burnt, waiters can
// register to be nofitied when the fuse burns. Once burnt, it always notifies
// immediately. Like a combination of a boolean and a ConditionVariable.
//
class Fuse {
  cv: ConditionVariable; 
  burnt: boolean; 
  
  constructor() {
    this.burnt = false; 
    this.cv = new ConditionVariable(); 
  }
  
  async wait(timeout?: number): Promise<void> {
    if (this.burnt) return; 
    
    await this.cv.wait(timeout); 
    return;
  }
  
  burn() {
    this.burnt = true; 
    this.cv.broadcast();
  }
  
  isBurnt(): boolean {
    return this.burnt;
  }
}

module.exports = {
  ConditionVariable: ConditionVariable, 
  Fuse: Fuse,
};