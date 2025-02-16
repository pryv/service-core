/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

require('test-helpers/src/api-server-tests-config');
const logger = require('@pryv/boiler').getLogger('test-helpers');
const testHelpers = require('test-helpers');
// --------------------------------------------------------- prespawning servers
logger.debug('creating new spawn context');
const SpawnContext = testHelpers.spawner.SpawnContext;
const spawnContext = new SpawnContext('test/support/child_process');

after(() => {
  logger.debug('shutting down spawn context');
  spawnContext.shutdown();
});

exports.spawnContext = spawnContext;
