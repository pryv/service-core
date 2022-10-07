/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global describe, it, before, assert */

require('test-helpers/src/api-server-tests-config');
const { getVersions } = require('./util');

describe('Migrations - new install', () => {
  const versions = getVersions();

  before(async () => {
    await versions.removeAll();
  });

  it('[OVYL] must set the initial version to the package file version and not perform other migrations', async () => {
    await versions.migrateIfNeeded();
    const v = await versions.getCurrent();
    assert.deepEqual(v, { _id: process.env.npm_package_version });
  });
});
