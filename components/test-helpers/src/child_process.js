/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const debug = require('debug')('child_process');
const msgpack = require('msgpack5')();

export interface ApplicationLauncher {
  launch(injectSettings: {}): mixed; 
}

class ChildProcess {
  launcher: Object; 
  
  constructor(launcher: ApplicationLauncher) {
    this.launcher = launcher;
    
    // This bit is useful to trace down promise rejections that aren't caught. 
    //
    process.on('unhandledRejection', 
      (...a) => this.unhandledRejection(...a));
      
    // Receives messages from the parent (spawner.js) and dispatches them to the 
    // handler functions below. 
    //
    process.on('message', 
      (...a) => this.handleParentMessage(...a));
  }

  // Handles promise rejections that aren't caught somewhere. This is very
  // useful for debugging. 
  unhandledRejection(reason: Error, promise: Promise<mixed>) {
    console.warn(                                // eslint-disable-line no-console
      'Unhandled promise rejection:', promise, 
      'reason:', reason.stack || reason); 
  }
  
  async handleParentMessage(wireMessage: Buffer) {
    const message = msgpack.decode(wireMessage);
    
    const [msgId, cmd, ...args] = message; 
    debug('handleParentMessage/received ', msgId, cmd, args);
    
    try {
      let ret = await this.dispatchParentMessage(cmd, ...args);
      
      // msgpack cannot encode undefined.
      if (ret === undefined) ret = null; 
      
      this.respondToParent(['ok', msgId, cmd, ret]);
    }
    catch (err) {
      debug('handleParentMessage/catch', err.message);
      // Using JSON.stringify as message que does nos support Object (just strings)
      this.respondToParent(['err', msgId, cmd, JSON.stringify({message: err.message, stack: err.stack})]);
    }
      
    debug('handleParentMessage/done', cmd);
  }
  respondToParent(msg: Array<mixed>) {
    debug('respondToParent', msg);
    
    // FLOW Somehow flow-type doesn't know about process here. 
    process.send(
      msgpack.encode(msg));
  }
  dispatchParentMessage(cmd: string, ...args: Array<mixed>): Promise<mixed> | mixed {
    if (! cmd.startsWith('int_')) {
      const launcher = this.launcher;
      
      if (typeof launcher[cmd] !== 'function')
        throw new Error(`Unknown/unhandled launcher message ${cmd}`);
        
      return launcher[cmd](...args);
    }

    // assert: cmd.startsWith('int_')
    switch(cmd) {
      case 'int_startServer': 
        // FLOW Assume this is happening...
        return this.intStartServer(args[0]);
      
      default: 
        throw new Error(`Unknown/unhandled internal message ${cmd}`);
    }
  }
  
  // ----------------------------------------------------------- parent messages
  
  // Tells the launcher to launch the application, injecting the given
  // `injectSettings`.
  // 
  async intStartServer(injectSettings: {}) {
    const launcher = this.launcher;
    
    return launcher.launch(injectSettings);
  }
  
  // Main method to launch the child process.
  // 
  run() {
    // // Keeps the event loop busy. This is what the child does as long as it is not 
    // // serving requests. 
    // //
    // function work() {
    //   setTimeout(work, 10000);
    // }
    // work(); 
  }
}

module.exports = ChildProcess;