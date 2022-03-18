/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
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

describe('Audit Storage Migration', () => {
  before(async () => {
    await initTests();
  });

  it('[MFFR]  Migrate v0 to v1', async function () {
    const userid = cuid();
    const srcPath = path.join(__dirname, '../support/migration/audit-v0.sqlite');
    const v0dbPath = path.join(os.tmpdir(), userid + '-v0.sqlite');
    const v1dbPath = path.join(os.tmpdir(), userid + '-v1.sqlite');
    await copyFile(srcPath, v0dbPath);

    const v1user = new UserDatabase(userid, {dbPath: v1dbPath});

    const logger = { info: () => {}, warn: () => {}, error: () => {}};
    const resMigrate = await versioning.migrate0to1(v0dbPath, v1user, logger);
    $$(resMigrate);
  });
  
});