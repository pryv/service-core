/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Mocha configuration for api-server PARALLEL tests
 *
 * This configuration excludes test files that cannot run in parallel:
 * - Pattern A tests that use shared testData (server.ensureStarted pattern)
 * - Tests that require server restarts
 * - Tests that use WebSocket connections
 *
 * Run with: PATTERN_C_PARALLEL=1 npx mocha --config .mocharc-parallel.js
 */
module.exports = {
  exit: true,
  slow: 20,
  timeout: 30000,
  ui: 'bdd',
  diff: true,
  reporter: 'dot',
  require: 'test-helpers/src/helpers-c.js',
  spec: 'test/**/*.test.js',
  parallel: true,
  // Exclude Pattern A tests (use testData with real HTTP server)
  ignore: [
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
    // Pattern A test designed for parallel but conflicts with mocha workers
    'test/login-parallel.test.js'
  ]
};
