/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Pattern C test helpers for api-server
 * Loaded by .mocharc.js for node tests
 *
 * Environment variables for test modes:
 * - DISABLE_INTEGRITY_CHECK=1  : Disable integrity checks (for PG or parallel)
 * - MOCHA_PARALLEL=1           : Running in parallel mode (also disables caching)
 * - PATTERN_C_AUDIT=1          : Enable audit functionality
 */

const base = require('./helpers-base');

// Test mode flags from environment
const disableIntegrityCheck = process.env.DISABLE_INTEGRITY_CHECK === '1';
const isAuditMode = process.env.PATTERN_C_AUDIT === '1';

// Build test config based on environment
const testConfig = {};
// Inject storageEngine into test config if overridden via env
if (process.env.STORAGE_ENGINE) {
  testConfig.storageEngine = process.env.STORAGE_ENGINE;
}

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

// Initialize base helpers
base.init({
  testConfig,
  // All API methods for api-server tests
  methods: [
    'events', 'streams', 'service', 'auth/login', 'auth/register',
    'accesses', 'account', 'profile', 'webhooks', 'utility'
  ]
});

// Export mocha hooks — integrity checks disabled when DISABLE_INTEGRITY_CHECK is set
exports.mochaHooks = base.getMochaHooks(disableIntegrityCheck);
