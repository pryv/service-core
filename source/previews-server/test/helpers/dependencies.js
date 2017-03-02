var testHelpers = require('components/test-helpers'),
    InstanceManager = testHelpers.InstanceManager;

/**
 * Overrides common test dependencies with server-specific config settings.
 */
var deps = module.exports = testHelpers.dependencies;
deps.settings = require('../../src/config').load();
deps.instanceManager = new InstanceManager({
  serverFilePath: __dirname + '/../../src/server.js',
  tcpMessaging: deps.settings.tcpMessaging,
  logging: deps.logging
});
