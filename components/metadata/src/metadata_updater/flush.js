// @flow

const storage = require('components/storage');

const { PendingUpdate } = require('./pending_updates');

import type { Operation } from './controller';

// Operation that flushes the update to MongoDB. 
// 
class Flush implements Operation {
  // The update to flush when calling #run. 
  update: PendingUpdate;
  // The connection to MongoDB.
  db: storage.StorageLayer;
  
  constructor(update: PendingUpdate, db: storage.StorageLayer) {
    this.update = update; 
    this.db = db;
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
