/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Pattern C test helpers for api-server - PARALLEL MODE
 * Same as helpers-c.js but without integrity checks
 * (integrity checks fail in parallel mode due to shared database)
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
let database = null;
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

  database = await storage.getDatabase();

  global.getNewFixture = function () {
    const fixture = databaseFixture(database);
    // Add profile helper to context (upsert - delete then insert)
    fixture.context.profile = async (username, profileData) => {
      const profileStorage = new storage.user.Profile(database);
      const user = { id: username };
      // First try to remove existing profile
      await new Promise((resolve) => {
        profileStorage.removeOne(user, { id: profileData.id }, () => resolve());
      });
      // Then insert the new profile
      await new Promise((resolve, reject) => {
        profileStorage.insertOne(user, { id: profileData.id, data: profileData.data }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    };
    return fixture;
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
  await require('../src/methods/utility')(global.app.api);

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

// Mocha hooks for parallel mode - NO integrity checks (shared database causes failures)
const fs = require('fs');

exports.mochaHooks = {
  async beforeAll () {
    const config = await getConfig();
    // create preview directories that would normally be created in normal setup
    const previewsDirPath = config.get('eventFiles:previewsDirPath');
    if (!fs.existsSync(previewsDirPath)) {
      fs.mkdirSync(previewsDirPath, { recursive: true });
    }
  }
  // No beforeEach/afterEach integrity checks in parallel mode
};
