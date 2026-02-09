/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Mocha configuration for api-server tests
 *
 * Test execution modes:
 * - Sequential (default): Tests run one at a time, sharing testData safely
 *   Run with: just test api-server
 *
 * - Parallel files: Test FILES run in parallel (requires PATTERN_C_PARALLEL=1)
 *   Run with: just test-parallel api-server
 *   Note: Only works for tests with isolated data (e.g., login-parallel.test.js)
 *   Tests sharing testData will fail due to database conflicts.
 *
 * Server instances use DynamicInstanceManager which allocates unique ports,
 * enabling multiple server processes to run simultaneously.
 */
module.exports = {
  // as of 2022-03-28, extending another config doesn't work (cf. https://github.com/mochajs/mocha/pull/4407),
  // so we have to duplicate settings in the root `.mocharc.js`
  // extends: '../../../.mocharc.js',
  exit: true,
  slow: 20,
  timeout: 10000,
  ui: 'bdd',
  diff: true,
  reporter: 'dot',
  require: 'test-helpers/src/helpers-c.js',
  spec: 'test/**/*.test.js'
};
