// @flow

const debug = require('debug')('child_process');

const ChildProcess = require('components/test-helpers').child_process;

class ApplicationLauncher {
  constructor() {
  }
  
  launch(injectSettings: {}) {
  }
}

const appLauncher = new ApplicationLauncher(); 
const childProcess = new ChildProcess(appLauncher);
childProcess.run();
