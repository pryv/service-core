/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global assert */

const setUserBasePathTestOnly = require('storage').userLocalDirectory.setBasePathTestOnly;

const path = require('path');
const { copy, pathExists } = require('fs-extra');
const cuid = require('cuid');
const migrate0to1 = require('../../src/userSQLite/migrations/1');
const UserDatabase = require('../../src/userSQLite/UserDatabase');
const os = require('os');
const { getLogger } = require('@pryv/boiler');
const Storage = require('../../src/userSQLite/Storage');

describe('SQLite user-centric storage migration', () => {
  let logger;
  before(async () => {
    logger = getLogger('sqlite-storage-migration-test');
  });

  after(() => {
    // reset userDirectory base path to original
    setUserBasePathTestOnly();
  });

  it('[MFFR] a single Migrate v0 to v1', async function () {
    const userid = cuid();
    const srcPath = path.join(__dirname, './support/migration/audit-v0.sqlite');
    const v0dbPath = path.join(os.tmpdir(), userid + '-v0.sqlite');
    const v1dbPath = path.join(os.tmpdir(), userid + '-v1.sqlite');
    await copy(srcPath, v0dbPath);

    const v1user = new UserDatabase(logger, { dbPath: v1dbPath });
    await v1user.init();

    const resMigrate = await migrate0to1(v0dbPath, v1user, logger);
    assert.equal(resMigrate.count, 298);
  });

  it('[RXVF] check userDir and perform migration when needed', async function () {
    this.timeout(30000);
    const srcDir = path.join(__dirname, './support/migration-userDirV0');
    const tempUserDir = path.join(os.tmpdir(), 'pryv.io-test-userdir-' + Math.random().toString(36).substring(2, 8));
    await copy(srcDir, tempUserDir);
    assert.isFalse(await pathExists(path.join(tempUserDir, 'audit-db-version-1.0.0.txt')));
    setUserBasePathTestOnly(tempUserDir);
    const storage = new Storage('audit');
    await storage.init();
    assert.isTrue(await pathExists(path.join(tempUserDir, 'audit-db-version-1.0.0.txt')));
    storage.close();
  });
});
