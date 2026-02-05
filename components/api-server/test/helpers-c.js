/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Pattern C test helpers for api-server
 * Provides global test initialization without spawning separate processes
 * Loaded by .mocharc.js for node tests
 */

require('test-helpers/src/api-server-tests-config');
const { getConfig } = require('@pryv/boiler');

const storage = require('storage');
const supertest = require('supertest');
const { getApplication } = require('../src/application');
const { databaseFixture } = require('test-helpers');
const { pubsub } = require('messages');
const userLocalDirectory = require('storage').userLocalDirectory;

let initTestsDone = false;
/**
 * Initialize basic test infrastructure
 * To be called in before()
 */
async function initTests () {
  if (initTestsDone) return;
  initTestsDone = true;
  global.config = await getConfig();
  await userLocalDirectory.init();
}

let initCoreDone = false;
/**
 * Initialize core API server
 * Requires initTests() to be called first
 */
async function initCore () {
  if (initCoreDone) return;
  initCoreDone = true;

  global.config.injectTestConfig({
    dnsLess: {
      isActive: true
    }
  });

  const database = await storage.getDatabase();

  global.getNewFixture = function () {
    return databaseFixture(database);
  };

  global.app = getApplication();
  await global.app.initiate();

  // Initialize notifications dependency
  const axonMsgs = [];
  const axonSocket = {
    emit: (...args) => axonMsgs.push(args)
  };
  pubsub.setTestNotifier(axonSocket);
  pubsub.status.emit(pubsub.SERVER_READY);

  // Load all API methods
  await require('../src/methods/events')(global.app.api);
  await require('../src/methods/streams')(global.app.api);
  require('../src/methods/service')(global.app.api);
  await require('../src/methods/auth/login')(global.app.api);
  await require('../src/methods/auth/register')(global.app.api);
  await require('../src/methods/accesses')(global.app.api);
  await require('../src/methods/account')(global.app.api);
  await require('../src/methods/profile')(global.app.api);
  await require('../src/methods/followedSlices')(global.app.api);
  await require('../src/methods/webhooks')(global.app.api);

  global.coreRequest = supertest(global.app.expressApp);
}

// Export globals for test files using `/* global ... */` directive
Object.assign(global, {
  initCore,
  initTests,
  assert: require('node:assert'),
  cuid: require('cuid'),
  charlatan: require('charlatan'),
  sinon: require('sinon'),
  path: require('path'),
  _: require('lodash')
});

// Mocha hooks for integrity checks (from hooks.js)
const fs = require('fs');
const util = require('util');

let usersIndex, platform;

async function initIndexPlatform () {
  if (usersIndex != null) return;
  const { getUsersLocalIndex } = require('storage');
  usersIndex = await getUsersLocalIndex();
  platform = require('platform').platform;
  await platform.init();
}

async function checkIndexAndPlatformIntegrity (title) {
  await initIndexPlatform();
  const checks = [
    await platform.checkIntegrity(),
    await usersIndex.checkIntegrity()
  ];
  for (const check of checks) {
    if (check.errors.length > 0) {
      const checkStr = util.inspect(checks, false, null, true);
      throw new Error(`${title} => Check should be empty \n${checkStr}`);
    }
  }
}

exports.mochaHooks = {
  async beforeAll () {
    const config = await getConfig();
    // create preview directories that would normally be created in normal setup
    const previewsDirPath = config.get('eventFiles:previewsDirPath');
    if (!fs.existsSync(previewsDirPath)) {
      fs.mkdirSync(previewsDirPath, { recursive: true });
    }
  },
  async beforeEach () {
    await checkIndexAndPlatformIntegrity('BEFORE ' + this.currentTest.title);
  },
  async afterEach () {
    await checkIndexAndPlatformIntegrity('AFTER ' + this.currentTest.title);
  }
};
