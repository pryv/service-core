/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

require('test-helpers/src/api-server-tests-config');
const logger = require('@pryv/boiler').getLogger('test-helpers');
const testHelpers = require('test-helpers');

// --------------------------------------------------------- prespawning servers

logger.debug('creating new spawn context');
const SpawnContext = testHelpers.spawner.SpawnContext;
const spawnContext: SpawnContext = 
  new SpawnContext('test/support/child_process');

/* global after */
after(() => {
  logger.debug('shutting down spawn context');
  spawnContext.shutdown(); 
});

exports.spawnContext = spawnContext;