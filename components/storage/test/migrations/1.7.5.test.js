/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Tests data migration between versions.
 */

/* global assert */

const bluebird = require('bluebird');
const helpers = require('test-helpers');
const storage = helpers.dependencies.storage;
const database = storage.database;
const testData = helpers.data;

const mongoFolder = __dirname + '../../../../../var-pryv/mongodb-bin';

const { getVersions } = require('./util');

describe('Migration - 1.7.5', function () {
  this.timeout(20000);

  let accessesCollection;

  before(async function () {
    if (database.isFerret) this.skip();
    accessesCollection = await database.getCollection({ name: 'accesses' });
  });

  after(async function () {
    if (database.isFerret) return;
    // erase all
    await accessesCollection.deleteMany({});
  });

  it('[MA7J] must handle data migration from 1.7.1 to 1.7.5', async function () {
    const newVersion = getVersions('1.7.5');

    await bluebird.fromCallback(cb => testData.restoreFromDump('1.7.1', mongoFolder, cb));

    // verify accesses afterwards
    const previousAccessesWithSystemStreamPermissions = await accessesCollection.find({ 'permissions.streamId': { $regex: /^\./ } }).toArray();
    const accessToCheck = previousAccessesWithSystemStreamPermissions[0];
    // perform migration
    await newVersion.migrateIfNeeded();

    // verify that accesses were migrated
    let isAccessToCheckProcessed = false;

    const accesses = await accessesCollection.find({}).toArray();
    for (const access of accesses) {
      if (access.type === 'personal') continue;
      if (access._id === accessToCheck._id) isAccessToCheckProcessed = true;
      for (const permission of access.permissions) {
        if (permission.streamId != null) {
          assert.isFalse(hasDotStreamId(permission.streamId));
        }
      }
    }
    assert.isTrue(isAccessToCheckProcessed);

    function hasDotStreamId (streamId) {
      return streamId.indexOf('.') > -1;
    }
  });
});
