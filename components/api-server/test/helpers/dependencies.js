/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const path = require('path');

const testHelpers = require('test-helpers');
const InstanceManager = testHelpers.InstanceManager;
const { getConfigUnsafe } = require('@pryv/boiler');

/**
 * Overrides common test dependencies with server-specific config settings.
 */
const deps = module.exports = testHelpers.dependencies;
deps.settings = getConfigUnsafe(true).get();
deps.instanceManager = new InstanceManager({
  serverFilePath: path.join(__dirname, '/../../bin/server'),
  axonMessaging: deps.settings.axonMessaging
});
