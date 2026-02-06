/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Mocha configuration for parallel Pattern C tests
 * These tests use supertest without binding to real ports
 */
module.exports = {
  exit: true,
  slow: 20,
  timeout: 10000,
  ui: 'bdd',
  diff: true,
  reporter: 'dot',
  require: 'test-helpers/src/helpers-c.js',
  parallel: true,
  jobs: 4,
  // Only include Pattern C test files that are safe for parallel execution
  spec: [
    'test/accesses-app.test.js',
    'test/accesses-personal.test.js',
    'test/events-mutiple-streamIds.test.js',
    'test/events.get-streams-query.test.js',
    'test/followed-slices.test.js',
    'test/permissions-create-only.test.js',
    'test/permissions-forcedStreams.test.js',
    'test/permissions-none.test.js',
    'test/permissions-selfRevoke.test.js',
    'test/permissions-tags.test.js',
    'test/profile-app.test.js',
    'test/profile-personal.test.js',
    'test/service-info.test.js',
    'test/webhooks.test.js'
  ]
};
