// @flow

const debug = require('debug')('child_process');

const ChildProcess = require('components/test-helpers').child_process;

const Application = require('../../src/application');

class ApplicationLauncher {
  app: ?Application; 
  
  constructor() {
    this.app = null; 
  }
  
  async launch(injectSettings: {}) {
    if (injectSettings.http == null || injectSettings.http.port == null)
      throw new Error('AF: http.port must be set.');
      
    const settingsOverride = {
      metadataUpdater: {
        host: '127.0.0.1', 
        port: injectSettings.http.port,
      }
    };
    
    const app = new Application(settingsOverride); 
    
    await app.run(); 
    
    this.app = app; 
  }
}

const appLauncher = new ApplicationLauncher(); 
const childProcess = new ChildProcess(appLauncher);
childProcess.run();
