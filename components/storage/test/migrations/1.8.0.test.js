/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Tests data migration between versions.
 */

/*global describe, it, assert */

const bluebird = require('bluebird');
require('test-helpers/src/api-server-tests-config');
const helpers = require('test-helpers');
const storage = helpers.dependencies.storage;
const database = storage.database;
const testData = helpers.data;

const mongoFolder = __dirname + '../../../../../../var-pryv/mongodb-bin';

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getVersions } = require('./util');

const { getUsersRepository } = require('business/src/users');

const usersIndex = require('business/src/users/UsersLocalIndex');

const { platform } = require('platform');


describe('Migration - 1.8.0',function () {
  this.timeout(20000);

  before(async function() {
    const newVersion = getVersions('1.8.0');
    await SystemStreamsSerializer.init();

    // --- user Index
    await bluebird.fromCallback(cb => testData.restoreFromDump('1.7.5', mongoFolder, cb));
    await usersIndex.init();
    await usersIndex.deleteAll();

    // --- erase platform wide db
    await platform.init();
    await platform.deleteAll();

     // perform migration
    await bluebird.fromCallback(cb => newVersion.migrateIfNeeded(cb));
  });

  after(async function() {

  });

  it('[WBIK] must handle userIndex migration from 1.7.5 to 1.8.0', async function () {
    const errors = await usersIndex.checkIntegrity();
    assert.isEmpty(errors, 'Found error(s) in the userIndex vs events check');
  });

  it('[URHS] must handle platfrom migration from 1.7.5 to 1.8.0', async function () {
    const errors = await platform.checkIntegrity();
    $$(errors);
    assert.isEmpty(errors, 'Found error(s) in the platform vs Users check');
  });

});


