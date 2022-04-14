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

const mongoFolder = __dirname + '../../../../../../var-pryv/mongodb-bin'

const { getVersions, compareIndexes, applyPreviousIndexes } = require('./util');


describe('Migration - 1.7.5',function () {
  this.timeout(20000);

  let accessesCollection;

  before(async function() {
    accessesCollection = await bluebird.fromCallback(cb => database.getCollection({ name: 'accesses' }, cb));
  });

  after(async function() {
    // erase all
    await accessesCollection.deleteMany({});
  });

  it('[MA7J] must handle data migration from 1.7.1 to 1.7.5', async function () {
    const newVersion = getVersions('1.7.5');
    const accessesStorage = storage.user.accesses;


    await bluebird.fromCallback(cb => testData.restoreFromDump('1.7.1', mongoFolder, cb));

    // verify accesses afterwards
    const previousAccessesWithSystemStreamPermissions = await (await accessesCollection.find({"permissions.streamId": { $regex : /^\./ }})).toArray();
    const accessToCheck = previousAccessesWithSystemStreamPermissions[0];
    // perform migration
    await bluebird.fromCallback(cb => newVersion.migrateIfNeeded(cb));

    // verify that accesses were migrated
    let isAccessToCheckProcessed = false;

    const accesses = await (await bluebird.fromCallback(cb => accessesCollection.find({}, cb))).toArray();
    for (const access of accesses) {
      if (access.type === 'personal') continue;
      if ( access._id === accessToCheck._id) isAccessToCheckProcessed = true;
      for (const permission of access.permissions) {
        if (permission.streamId != null) {
          assert.isFalse(hasDotStreamId(permission.streamId));
        }
      }
    }
    assert.isTrue(isAccessToCheckProcessed);

    function hasDotStreamId(streamId) {
      return streamId.indexOf('.') > -1;
    }
  });

});
