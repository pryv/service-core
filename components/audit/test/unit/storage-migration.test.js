/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/* global describe, assert, cuid, audit, config, initTests*/

const path = require('path');
const { copyFile } = require('fs/promises');
const cuid = require('cuid');
const versioning = require('../../src/storage/versioning');
const UserDatabase = require('../../src/storage/UserDatabase');
const os = require('os');
const { getLogger } = require('@pryv/boiler');

describe('Audit Storage Migration', () => {
  let logger;
  before(async () => {
    await initTests();
    logger = getLogger('sqlite-storage-migration-test');
  });

  it('[MFFR] a single Migrate v0 to v1', async function () {
    const userid = cuid();
    const srcPath = path.join(__dirname, '../support/migration/audit-v0.sqlite');
    const v0dbPath = path.join(os.tmpdir(), userid + '-v0.sqlite');
    const v1dbPath = path.join(os.tmpdir(), userid + '-v1.sqlite');
    await copyFile(srcPath, v0dbPath);

    const v1user = new UserDatabase(logger, {dbPath: v1dbPath});
    await v1user.init();

    const resMigrate = await versioning.migrate0to1(v0dbPath, v1user, logger);
    assert.equal(resMigrate.count, 298);
  });

  it('[RXVF]  check userDir and perform migration when needed', async function () {
    throw new Error('todo');
  });
  
  it('[SQIY]  check userDir and skip migration when not needed', async function () {
    throw new Error('todo');
  });
});