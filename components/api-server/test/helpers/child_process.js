/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow



const Server = require('../../src/server');
const Application = require('../../src/application');
const ChildProcess = require('components/test-helpers').child_process;

const { getLogger, getConfig} = require('boiler');
const logger = getLogger('child_process');


class ApplicationLauncher {
  app: ?Application; 
  
  constructor() {
    this.app = null; 
  }
  
  async launch(injectSettings: Object) {
    try {
      logger.debug('launch with settings', injectSettings);
  
      const config = await getConfig();
      // directly inject settings in nconf // to be updated to 
      config.injectTestConfig(injectSettings);

      const app = this.app = new Application();
      await app.initiate();

      const server = new Server(app); 
      return server.start(); 

    } catch (e) { // this is necessary for debug process as Error is not forwarded correctly
      console.error('Error during child_process.launch()', e);
      throw e; // foward error
    }
  }
}

const appLauncher = new ApplicationLauncher();
const clientProcess = new ChildProcess(appLauncher); 
clientProcess.run(); 
