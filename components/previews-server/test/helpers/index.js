/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Extends the common test support object with server-specific stuff.
 */

process.env.NODE_ENV = 'test';
require('test-helpers/src/api-server-tests-config');

const testHelpers = require('test-helpers');

module.exports = testHelpers;

const InstanceManager = testHelpers.InstanceManager;

const { getConfigUnsafe } = require('@pryv/boiler');
const path = require('path');
/**
 * Overrides common test dependencies with server-specific config settings.
 */
testHelpers.dependencies.settings = getConfigUnsafe(true).get();
testHelpers.dependencies.instanceManager = new InstanceManager({
  serverFilePath: path.resolve(__dirname, '../../src/server.js'),
  axonMessaging: testHelpers.dependencies.settings.axonMessaging,
  logging: testHelpers.dependencies.logging
});

before(async function () {
  await testHelpers.dependencies.init();
});
