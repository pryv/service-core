/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Loaded by .mocharc.js for node tests
 */
const path = require('path');
const {getConfig} = require('@pryv/boiler').init(
  {
    appName: 'AuditTests',
    baseConfigDir: path.resolve(__dirname, '../config'),
    extraConfigs: [
      {
        scope: 'serviceInfo',
        key: 'service',
        urlFromKey: 'serviceInfoUrl'
      },
      {
        plugin: require('api-server/config/components/systemStreams')
      }
    ]
  });

const audit = require('../src/');

/**
 * Core
 */
const { Database } = require('storage');
const supertest = require('supertest');
const Application = require('api-server/src/application');
const { databaseFixture } = require('test-helpers');
const Notifications = require('api-server/src/Notifications');

/**
 * To be call in before()
 */
async function initTests() {
  await audit.init();
  global.audit = audit;
  global.config = await getConfig();
}

/**
 * To be call in after()
 */
function closeTests() { 
  if (global.audit) global.audit.close();
  global.audit = null;
  global.config = null;
}

/**
 * requires initTests()
 */
async function initCore() {
  const database = new Database(config.get('database')); 
  
  global.mongoFixtures = databaseFixture(database);
  global.app = new Application();
  await global.app.initiate();

  // Initialize notifications dependency
  let axonMsgs = [];
  const axonSocket = {
    emit: (...args) => axonMsgs.push(args),
  };
  const notifications = new Notifications(axonSocket);
  notifications.serverReady();

  require('api-server/src/methods/events')(
    app.api,
    app.storageLayer.events,
    app.storageLayer.eventFiles,
    app.config.get('auth'),
    app.config.get('service:eventTypes'),
    notifications,
    app.logging,
    app.config.get('versioning'),
    app.config.get('updates'),
    app.config.get('openSource'),
    app.config.get('services'));

  global.coreRequest = supertest(app.expressApp);
}
async function stopCore() {
  // destroy fixtures
}



Object.assign(global, {
  initCore: initCore,
  initTests: initTests,
  closeTests: closeTests,
  assert: require('chai').assert,
  cuid: require('cuid'),
  charlatan: require('charlatan'),
  bluebird: require('bluebird'),
});


