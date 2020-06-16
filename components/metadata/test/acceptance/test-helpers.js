// @flow

const debug = require('debug')('test-helpers');
const testHelpers = require('components/test-helpers');

// --------------------------------------------------------- prespawning servers

debug('creating new spawn context');
const { SpawnContext } = testHelpers.spawner;
const spawnContext: SpawnContext = new SpawnContext('test/support/child_process');

/* global after */
after(() => {
  debug('shutting down spawn context');
  spawnContext.shutdown();
});

exports.spawnContext = spawnContext;
