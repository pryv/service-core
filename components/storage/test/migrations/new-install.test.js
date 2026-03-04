/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/* global assert */

const timestamp = require('unix-timestamp');
const { getVersions } = require('./util');
const { getConfig } = require('@pryv/boiler');

// MongoDB-specific migration test — skip in PG mode
describe('[MGNI] Migrations - new install', function () {
  if (process.env.STORAGE_ENGINE === 'postgresql') {
    before(function () { this.skip(); });
    return;
  }
  const versions = getVersions();
  let isOpenSource = false;

  before(async () => {
    const config = await getConfig();
    await versions.removeAll();
    isOpenSource = config.get('openSource:isActive');
  });

  it('[OVYL] must set the initial version to the package file version and not perform other migrations', async () => {
    await versions.migrateIfNeeded();
    const v = await versions.getCurrent();
    assert.ok(v != null);
    if (isOpenSource) {
      assert.strictEqual(process.env.npm_package_version.startsWith(v._id), true, process.env.npm_package_version + ' should starts with' + v.id);
    } else {
      assert.strictEqual(v._id, process.env.npm_package_version);
    }
    assert.ok(Math.abs(v.initialInstall - timestamp.now()) <= 1000);
  });
});
