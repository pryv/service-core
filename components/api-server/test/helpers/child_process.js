/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Server = require('../../src/server');
const { getApplication } = require('api-server/src/application');
const ChildProcess = require('test-helpers').child_process;
const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('child_process');

class ApplicationLauncher {
  app;
  constructor () {
    this.app = null;
  }

  /**
   * @param {any} injectSettings
   * @returns {Promise<any>}
   */
  async launch (injectSettings) {
    try {
      logger.debug('launch with settings', injectSettings);
      const config = await getConfig();
      // directly inject settings in nconf // to be updated to
      config.injectTestConfig(injectSettings);
      const app = (this.app = getApplication());
      await app.initiate();
      const server = new Server();
      return server.start();
    } catch (e) {
      // this is necessary for debug process as Error is not forwarded correctly
      logger.error('Error during child_process.launch()', e);
      throw e; // foward error
    }
  }
}
const appLauncher = new ApplicationLauncher();
const clientProcess = new ChildProcess(appLauncher);
clientProcess.run();
