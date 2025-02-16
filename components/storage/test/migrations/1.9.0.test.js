/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Tests data migration between versions.
 */

const util = require('util');
const helpers = require('test-helpers');
const testData = helpers.data;
const { getMall } = require('mall');
const mongoFolder = __dirname + '../../../../../var-pryv/mongodb-bin';
const { remove } = require('fs-extra');
const path = require('path');

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getVersions } = require('./util');

const integrityFinalCheck = require('test-helpers/src/integrity-final-check');
const userWithAttachments = 'u_0';
const storage = require('storage');

describe('Migration - 1.9.0', function () {
  this.timeout(20000);
  let userLocalDirectory;

  before(async function () {
    const database = await storage.getDatabase();
    if (database.isFerret) this.skip();
    // remove user attachments
    userLocalDirectory = storage.userLocalDirectory;
    await userLocalDirectory.init();
    const userLocalDir = await userLocalDirectory.getPathForUser(userWithAttachments);
    const newAttachmentDirPath = path.join(userLocalDir, 'attachments');
    await remove(newAttachmentDirPath);

    const newVersion = getVersions('1.9.0');
    await SystemStreamsSerializer.init();
    await util.promisify(testData.restoreFromDump)('1.8.0', mongoFolder);

    // perform migration
    await newVersion.migrateIfNeeded();
  });

  after(async () => { });

  it('[MCHA] Check attachments', async () => {
    const mall = await getMall();
    const allUserEvents = await mall.events.get(userWithAttachments, {});
    for (const event of allUserEvents) {
      if (event.attachments) {
        for (const attachment of event.attachments) {
          // throw error if does not exists
          await mall.events.getAttachment(userWithAttachments, { id: event.id }, attachment.id);
        }
      }
    }
  });

  it('[XAAB] Check integrity of database', async () => {
    await integrityFinalCheck.all();
  });
});
