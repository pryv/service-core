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

const audit = require('../src/');

/**
 * Core
 */
const storage = require('storage');
const supertest = require('supertest');
const { getApplication } = require('api-server/src/application');
const { databaseFixture } = require('test-helpers');
const { Notifications } = require('messages');
const { pubsub } = require('messages');
const cache = require('cache');

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

  // Initialize notifications dependency
  let axonMsgs = [];
  const axonSocket = {
    emit: (...args) => axonMsgs.push(args),
  };
  const notifyTests = new Notifications(axonSocket);
  pubsub.emit(pubsub.SERVER_READY);

  require('api-server/src/methods/events')(
    app.api,
    app.storageLayer.events,
    app.storageLayer.eventFiles,
    app.config.get('auth'),
    app.config.get('service:eventTypes'),
    notifyTests,
    app.logging,
    app.config.get('versioning'),
    app.config.get('updates'),
    app.config.get('openSource'),
    app.config.get('services'));

  await require('api-server/src/methods/streams')(app.api);
  require('api-server/src/methods/service')(app.api);
  await require('api-server/src/methods/auth/login')(app.api);
  await require('api-server/src/methods/auth/register')(app.api);
  await require('api-server/src/methods/accesses')(app.api);
  global.coreRequest = supertest(app.expressApp);
}


Object.assign(global, {
  initCore: initCore,
  initTests: initTests,
  cache: cache,
  assert: require('chai').assert,
  cuid: require('cuid'),
  charlatan: require('charlatan'),
  bluebird: require('bluebird'),
  sinon: require('sinon'),
  path: require('path'),
  _: require('lodash'),
  apiMethods: require('audit/src/ApiMethods'),
  validation: require('audit/src/validation'),
});


