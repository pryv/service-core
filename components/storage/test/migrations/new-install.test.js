/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert */

const timestamp = require('unix-timestamp');
const { getVersions } = require('./util');

describe('Migrations - new install', () => {
  const versions = getVersions();

  before(async () => {
    await versions.removeAll();
  });

  it('[OVYL] must set the initial version to the package file version and not perform other migrations', async () => {
    await versions.migrateIfNeeded();
    const v = await versions.getCurrent();
    assert.exists(v);
    assert.equal(v._id, process.env.npm_package_version);
    assert.approximately(v.initialInstall, timestamp.now(), 1000);
  });
});
