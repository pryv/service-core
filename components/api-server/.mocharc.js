/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const { createConfig } = require('../../.mocharc.js');

// Tests that cannot run in parallel due to shared state or special requirements
const nonParallelTests = [
  // Pattern A tests using testData with shared users
  'test/account.test.js',
  'test/events.test.js',
  'test/login.test.js',
  'test/permissions.test.js',
  'test/streams.test.js',
  // Tests requiring server restarts or special config
  'test/system.test.js',
  // Tests using WebSocket/raw HTTP
  'test/sockets.test.js',
  'test/root.test.js',
  'test/result-chunk-streaming.test.js',
  // Tests with parallel conflicts
  'test/login-parallel.test.js',
  'test/streams-patternc.test.js',
  'test/events-patternc.test.js',
  'test/events-mutiple-streamIds.test.js',
  'test/events.get-streams-query.test.js',
  'test/deletion.test.js',
  'test/webhooks.test.js',
  'test/accesses-personal.test.js',
  'test/permissions-selfRevoke.test.js',
  'test/profile-personal.test.js',
  'test/service-info.test.js',
  'test/acceptance/accesses.default-streams.test.js',
  'test/acceptance/events.default-streams.test.js',
  'test/acceptance/account.default-streams.test.js',
  'test/acceptance/events-audit.test.js',
  'test/acceptance/prefix-backward-compatibility.test.js',
  'test/acceptance/streams.default-streams.test.js',
  'test/acceptance/accesses.test.js',
  'test/profile-app.test.js'
];

module.exports = createConfig({
  require: 'test-helpers/src/helpers-c.js',
  timeout: 10000,
  slow: 20,
  nonParallelTests
});
