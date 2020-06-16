const testHelpers = require('components/test-helpers');

const { InstanceManager } = testHelpers;

/**
 * Overrides common test dependencies with server-specific config settings.
 */
const deps = module.exports = testHelpers.dependencies;
deps.settings = require('../../src/config').load();

deps.instanceManager = new InstanceManager({
  serverFilePath: `${__dirname}/../../src/server.js`,
  tcpMessaging: deps.settings.tcpMessaging,
  logging: deps.logging,
});
