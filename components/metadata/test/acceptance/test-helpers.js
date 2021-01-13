/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

require('../../../test-helpers/src/boiler-init');
const reggol = require('boiler').getReggol('test-helpers');
const testHelpers = require('components/test-helpers');

// --------------------------------------------------------- prespawning servers

reggol.debug('creating new spawn context');
const SpawnContext = testHelpers.spawner.SpawnContext;
const spawnContext: SpawnContext = 
  new SpawnContext('test/support/child_process');

/* global after */
after(() => {
  reggol.debug('shutting down spawn context');
  spawnContext.shutdown(); 
});

exports.spawnContext = spawnContext;