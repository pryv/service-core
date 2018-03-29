// @flow

const { PendingUpdate } = require('./pending_updates');

import type { Operation } from './controller';

// Operation that flushes the update to MongoDB. 
// 
class Flush implements Operation {
  // The update to flush when calling #run. 
  update: PendingUpdate;
  
  constructor(update: PendingUpdate) {
    this.update = update; 
  }
  
  // Flushes the information in `this.update` to disk (MongoDB).
  // 
  async run(): Promise<*> {
    return 1;
  }
}

module.exports = {
  Flush
};
