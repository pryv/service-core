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
const UserLocalDirectory = require('business').users.UserLocalDirectory;

/**
 * To be call in before()
 */
async function initTests() {
  if (global.audit) return;
  await audit.init();
  global.audit = audit;
  global.config = await getConfig();
  await UserLocalDirectory.init();
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
  if (global.app) return;
  config.injectTestConfig({
    dnsLess: {
      isActive: true,
    },
  });
  const database = await storage.getDatabase();  
  
  global.mongoFixtures = databaseFixture(database);
  global.app = getApplication();
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
  require('api-server/src/methods/service')(app.api);
  require('api-server/src/methods/auth/login')(app.api, 
    app.storageLayer.accesses, 
    app.storageLayer.sessions, 
    app.storageLayer.events, 
    config.get('auth'));
  require('api-server/src/methods/auth/register')(app.api, 
    app.logging, 
    app.storageLayer, 
    config.get('services'));
  require('api-server/src/methods/accesses')(
    app.api, 
    notifications, 
    app.getUpdatesSettings(), 
    app.storageLayer);
  require('audit/src/methods/audit-logs')(app.api);
  global.coreRequest = supertest(app.expressApp);
}
async function closeCore() {
  await mongoFixtures.clean();
}

function fakeAuditEvent(methodId) {
  return {
    createdBy: 'system',
    streamIds: [cuid()],
    type: 'log/test',
    content: {
      source: { name: 'http', ip: charlatan.Internet.IPv4() },
      action: methodId,
      status: 200,
      query: {},
    },
  };
}


function addActionStreamIdPrefix(methodId) {
  return audit.CONSTANTS.STORE_PREFIX + audit.CONSTANTS.ACTION_STREAM_ID + audit.CONSTANTS.SUB_STREAM_SEPARATOR + methodId;
}

function addAccessStreamIdPrefix(accessId) {
  return audit.CONSTANTS.STORE_PREFIX + audit.CONSTANTS.ACCESS_STREAM_ID + audit.CONSTANTS.SUB_STREAM_SEPARATOR + accessId;
}

Object.assign(global, {
  initCore: initCore,
  initTests: initTests,
  closeTests: closeTests,
  closeCore: closeCore,
  assert: require('chai').assert,
  cuid: require('cuid'),
  charlatan: require('charlatan'),
  bluebird: require('bluebird'),
  sinon: require('sinon'),
  path: require('path'),
  _: require('lodash'),
  apiMethods: require('audit/src/ApiMethods'),
  MethodContextUtils: require('audit/src/MethodContextUtils'),
  fakeAuditEvent: fakeAuditEvent,
  validation: require('audit/src/validation'),
  AuditFilter: require('audit/src/AuditFilter'),
  addActionStreamIdPrefix,
  addAccessStreamIdPrefix
});


