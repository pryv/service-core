/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var testHelpers = require('test-helpers'),
    InstanceManager = testHelpers.InstanceManager;

const { getConfigUnsafe } = require('@pryv/boiler');

/**
 * Overrides common test dependencies with server-specific config settings.
 */
var deps = module.exports = testHelpers.dependencies;
deps.settings = getConfigUnsafe(true).get();
deps.instanceManager = new InstanceManager({
  serverFilePath: __dirname + '/../../bin/server',
  axonMessaging: deps.settings.axonMessaging});
