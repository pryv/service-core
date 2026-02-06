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
 *
 * Environment variables for test modes:
 * - PATTERN_C_PARALLEL=1       : Disable integrity checks (for parallel execution)
 * - PATTERN_C_AUDIT=1          : Enable audit functionality
 * - PATTERN_C_BACKWARD_COMPAT=1: Enable backward compatibility prefix
 */

require('test-helpers/src/api-server-tests-config');
const { getConfig } = require('@pryv/boiler');

const storage = require('storage');
const supertest = require('supertest');
const { getApplication } = require('../src/application');
const { databaseFixture } = require('test-helpers');
const { pubsub } = require('messages');
const userLocalDirectory = require('storage').userLocalDirectory;

// Test mode flags from environment
const isParallelMode = process.env.PATTERN_C_PARALLEL === '1';
const isAuditMode = process.env.PATTERN_C_AUDIT === '1';
const isBackwardCompatMode = process.env.PATTERN_C_BACKWARD_COMPAT === '1';

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

  // Build config based on test mode
  const testConfig = {
    dnsLess: { isActive: true }
  };

  if (isAuditMode) {
    testConfig.audit = {
      active: true,
      storage: {
        filter: {
          methods: {
            include: ['all'],
            exclude: []
          }
        }
      }
    };
    testConfig.syslog = {
      filter: {
        methods: {
          exclude: ['all'],
          include: []
        }
      }
    };
  }

  if (isBackwardCompatMode) {
    testConfig.backwardCompatibility = {
      systemStreams: {
        prefix: { isActive: true }
      }
    };
    testConfig.versioning = {
      deletionMode: 'keep-everything',
      forceKeepHistory: true
    };
  }

  global.config.injectTestConfig(testConfig);

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

  // Load audit methods if audit is active (config or env var)
  if (global.config.get('audit:active')) {
    await require('audit/src/methods/audit-logs')(global.app.api);
  }

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

// Mocha hooks
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
  // Integrity checks only in non-parallel mode
  ...(isParallelMode
    ? {}
    : {
        async beforeEach () {
          await checkIndexAndPlatformIntegrity('BEFORE ' + this.currentTest.title);
        },
        async afterEach () {
          await checkIndexAndPlatformIntegrity('AFTER ' + this.currentTest.title);
        }
      })
};
