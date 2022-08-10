/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

require('test-helpers/src/api-server-tests-config');
const ChildProcess = require('test-helpers').child_process;

const Application = require('../../src/application');

class ApplicationLauncher {
  app: ?Application; 
  
  constructor() {
    this.app = null; 
  }
  
  async launch(injectSettings: any) {
    if (injectSettings.http == null || injectSettings.http.port == null)
      throw new Error('AF: http.port must be set.');
      
    const settingsOverride = {
      metadataUpdater: {
        host: '127.0.0.1', 
        port: injectSettings.http.port,
      }
    };
    
    const app = new Application(); 
    
    await app.setup(settingsOverride);
    await app.run(); 
    
    this.app = app; 
  }
}

const appLauncher = new ApplicationLauncher(); 
const childProcess = new ChildProcess(appLauncher);
childProcess.run();
