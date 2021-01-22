/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const storage = require('storage');

const { PendingUpdate, PendingUpdatesMap } = require('./pending_updates');
const { Flush } = require('./flush');

// Controller for the metadata updates. Manages operation timing and starts 
// actual update flush operation. 
// 
class Controller {
  logger;
  
  // The timer set by #runEach.
  timer: ?IntervalID; 
  
  // Reference to the updates map. This is where work comes from. 
  map: PendingUpdatesMap;
  
  // Database connection
  db: storage.StorageLayer;
    
  constructor(
    db: storage.StorageLayer, map: PendingUpdatesMap, logger) 
  {
    this.logger = logger; 
    this.db = db;
    this.map = map;
    
    this.timer = null; 
  }
  
  // Runs the #act method every `frequency` miliseconds; act will perform the main
  // controller action.
  // 
  runEach(frequency: number) {
    if (frequency <= 0) throw new Error('Precondition failure: frequency cannot be negative.');
    
    const timer = setInterval(
      () => this.act(), 
      frequency);
    
    this.timer = timer; 
  }
  
  // Stops the timer that was started using runEach. Call this when disposing
  // of the controller. 
  // 
  stop() {
    const timer = this.timer; 
    this.timer = null; 
    
    if (timer != null) clearInterval(timer);
  }
  
  // Reads updates from the updates map and flushes them to mongodb. 
  // 
  // NOTE Updates are made serially for now; this may result in a lot of 
  // requests to MongoDB. To optimise this, you might want to add batch calls
  // at this point. 
  // 
  async act(fixedNow?: EpochTime): Promise<*> {
    const map = this.map; 
    
    let now = new Date() / 1e3;
    if (fixedNow != null) now = fixedNow;
    
    const updates = map.getElapsed(now);
    if (updates.length <= 0) return;
    
    const ops = updates.map(u => this.flushOp(u));
        
    const logger = this.logger;
    logger.info(`Flushing ${updates.length} updates to disk...`);
    
    for (const op of ops) {
      await op.run(); 
    }
    
    logger.info('Flush done.');
  }
  
  // Returns a Flush operation for the update `update`. Acts as a producer. 
  // 
  flushOp(update: PendingUpdate): Operation {
    return new Flush(update, this.db, this.logger);
  }
}

type EpochTime = number; // time in seconds since epoch

// A generalisation of something that executes and takes some time. FP people
// would use a function here. 
// 
export interface Operation {
  run(): Promise<*>;
}

module.exports = {
  Controller
};
