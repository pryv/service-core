/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Tests data migration between versions.
 */

/*global describe, it, _, assert, bluebird */

require('test-helpers/src/api-server-tests-config');
const helpers = require('test-helpers');
const storage = helpers.dependencies.storage;
const database = storage.database;
const testData = helpers.data;

const mongoFolder = __dirname + '../../../../../../var-pryv/mongodb-bin'

const { getVersions } = require('./util');


describe('Migration - 1.8.0',function () {
  this.timeout(20000);


  before(async function() { 
   
  });

  after(async function() {
    // erase alls
  });

  it('must handle data migration from 1.7.5 to 1.8.0', async function () {
    const newVersion = getVersions('1.8.0');
    const accessesStorage = storage.user.accesses;

    await bluebird.fromCallback(cb => testData.restoreFromDump('1.7.5', mongoFolder, cb));

  });

});
