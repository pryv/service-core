/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Tests data migration between versions.
 */

const bluebird = require('bluebird');
require('test-helpers/src/api-server-tests-config');
const helpers = require('test-helpers');
const storage = helpers.dependencies.storage;
const database = storage.database;
const testData = helpers.data;

const mongoFolder = __dirname + '../../../../../var-pryv/mongodb-bin';

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getVersions } = require('./util');

const integrityFinalCheck = require('test-helpers/src/integrity-final-check');

describe('Migration - 1.8.1', function () {
  this.timeout(20000);

  before(async function () {
    const newVersion = getVersions('1.8.1');
    await SystemStreamsSerializer.init();
    await bluebird.fromCallback(cb => testData.restoreFromDump('1.8.0', mongoFolder, cb));

    // perform migration
    await newVersion.migrateIfNeeded();
  });

  after(async () => {});

  it('[XAAB] Check integrity of database', async () => {
    await integrityFinalCheck.all();
  });
});
