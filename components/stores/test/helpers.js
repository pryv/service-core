/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Loaded by .mocharc.js for node tests
 */
require('test-helpers/src/api-server-tests-config');
const { getConfig } = require('@pryv/boiler');
const supertest = require('supertest');

/**
 * Core
 */
const storage = require('storage');
const { getApplication } = require('api-server/src/application');
const { databaseFixture } = require('test-helpers');


const { pubsub } = require('messages');

let initTestsDone = false;
/**
 * To be call in before()
 */
async function initTests() {
  if (initTestsDone) return;
  initTestsDone = true;
  global.config = await getConfig();
}

let initCoreDone = false;
/**
 * requires initTests()
 */
async function initCore() {
  if (initCoreDone) return;
  initCoreDone = true;
  config.injectTestConfig({
    dnsLess: {
      isActive: true,
    },
  });
  const database = await storage.getDatabase();  
  
  global.getNewFixture = function() {
    return databaseFixture(database);
  }

  global.app = getApplication();
  await global.app.initiate();

  // Initialize notifyTests dependency
  let axonMsgs = [];
  const axonSocket = {
    emit: (...args) => axonMsgs.push(args),
  };
  pubsub.setTestNotifier(axonSocket);
  pubsub.emit(pubsub.SERVER_READY);

  await require('api-server/src/methods/events')(app.api);
  await require('api-server/src/methods/streams')(app.api);
  await require('api-server/src/methods/accesses')(app.api);
  global.coreRequest = supertest(app.expressApp);
}


Object.assign(global, {
  initCore: initCore,
  initTests: initTests,
  assert: require('chai').assert,
  cuid: require('cuid'),
  charlatan: require('charlatan')
});


