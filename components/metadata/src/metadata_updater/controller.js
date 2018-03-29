// @flow

// Controller for the metadata updates. Manages operation timing and starts 
// actual update flush operation. 


class Controller {
  timer: ?number; 
  
  constructor() {
    this.timer = null; 
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
  act() {
    
  }
  
  
}

module.exports = {
  Controller
};
