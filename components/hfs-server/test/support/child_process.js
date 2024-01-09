/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const bluebird = require('bluebird');
const Application = require('../../src/application');
const { InfluxRowType, TypeRepository } = require('business').types;
const ChildProcess = require('test-helpers').child_process;
const { getConfig } = require('@pryv/boiler');
const typeRepo = new TypeRepository();

class ApplicationLauncher {
  app;
  constructor () {
    this.app = null;
  }

  // Gets called by the test process to mock out authentication and allow everyone
  // access.
  //
  /**
   * @param {boolean} allowAll
   * @returns {void}
   */
  mockAuthentication (allowAll) {
    const app = this.app;
    if (app == null) { throw new Error('AF: app should not be null anymore'); }
    const context = app.context;
    context.metadata = this.produceMetadataLoader(allowAll);
  }

  /**
   * @returns {any}
   */
  produceMetadataLoader (authTokenValid = true) {
    const seriesMeta = {
      canWrite: () => authTokenValid,
      canRead: () => authTokenValid,
      isTrashedOrDeleted: () => false,
      namespaceAndName: () => ['test', 'foo'],
      produceRowType: () => new InfluxRowType(typeRepo.lookup('mass/kg'))
    };
    return {
      forSeries: function forSeries () {
        return bluebird.resolve(seriesMeta);
      }
    };
  }

  // Tells the server to use the metadata updater service located at `endpoint`
  /**
   * @returns {Promise<void>}
   */
  async useMetadataUpdater (endpoint) {
    const app = this.app;
    if (app == null) { throw new Error('AF: app should not be null anymore'); }
    const context = app.context;
    await context.configureMetadataUpdater(endpoint);
  }

  /**
   * @returns {Promise<void>}
   */
  async launch (injectSettings = {}) {
    const config = await getConfig();
    config.injectTestConfig(injectSettings);
    const app = (this.app = new Application());
    await app.init();
    await app.start();
  }
}
const appLauncher = new ApplicationLauncher();
const childProcess = new ChildProcess(appLauncher);
childProcess.run();
process.on('SIGTERM', () => {
  // Delay actual exit for half a second, allowing our tracing code to submit
  // all traces to jaeger.
  setTimeout(() => process.exit(0), 100);
});
