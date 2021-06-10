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
const { AuditAccessIds } = require('audit/src/MethodContextUtils');

let initTestsDone = false;
/**
 * To be call in before()
 */
async function initTests() {
  if (initTestsDone) return;
  initTestsDone = true;
  await audit.init();
  global.audit = audit;
  global.config = await getConfig();
  await UserLocalDirectory.init();
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

  require('api-server/src/methods/streams')(app.api, 
    app.storageLayer.streams, 
    app.storageLayer.events, 
    app.storageLayer.eventFiles, 
    this.notificationBus, 
    app.logging, 
    app.config.get('versioning'), 
    app.config.get('updates'));
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

function fakeAuditEvent(methodId) {
  return {
    createdBy: 'system',
    streamIds: [cuid()],
    type: 'log/test',
    content: {
      source: { name: 'http', ip: charlatan.Internet.IPv4() },
      action: methodId,
      query: {},
    },
  };
}


function addActionStreamIdPrefix(methodId) {
  return audit.CONSTANTS.STORE_PREFIX + audit.CONSTANTS.ACTION_STREAM_ID_PREFIX + methodId;
}

function addAccessStreamIdPrefix(accessId) {
  return audit.CONSTANTS.STORE_PREFIX + audit.CONSTANTS.ACCESS_STREAM_ID_PREFIX + accessId;
}

Object.assign(global, {
  initCore: initCore,
  initTests: initTests,
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
  addAccessStreamIdPrefix,
  CONSTANTS: audit.CONSTANTS,
  AuditAccessIds: AuditAccessIds,
});


