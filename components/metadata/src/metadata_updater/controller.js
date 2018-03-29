// @flow

const { PendingUpdate, PendingUpdatesMap } = require('./pending_updates');

// Controller for the metadata updates. Manages operation timing and starts 
// actual update flush operation. 
class Controller {
  // The timer set by #runEach.
  timer: ?number; 
  
  // Reference to the updates map. This is where work comes from. 
  map: PendingUpdatesMap;
  
  constructor(map: PendingUpdatesMap) {
    this.timer = null; 
    this.map = map;
  }
  
  // Runs the #act method every n miliseconds; act will perform the main
  // controller action.
  // 
  runEach(n: number) {
    if (n <= 0) throw new Error('Invalid arguments');
    
    const timer = setInterval(
      () => this.act(), 
      n);
    
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
  async act(fixedNow?: EpochTime): Promise<*> {
    const map = this.map; 
    
    let now = new Date() / 1e3;
    if (fixedNow != null) now = fixedNow;
    
    const updates = map.getElapsed(now);
    const ops = updates.map(u => this.flushOp(u));
    
    for (const op of ops) {
      await op.run(); 
    }
  }
  
  // Returns a Flush operation for the update `update`. Acts as a producer. 
  // 
  flushOp(update: PendingUpdate): Operation {
    update;
    return {
      run: () => Promise.resolve(1),
    };
  }
}

type EpochTime = number; // time in seconds since epoch

// A generalisation of something that executes and takes some time. FP people
// would use a function here. 
// 
interface Operation {
  run(): Promise<*>;
}

module.exports = {
  Controller
};
