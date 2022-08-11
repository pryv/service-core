/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');

const Versions = require('../../src/Versions');
const migrations = require('../../src/migrations');
const helpers = require('test-helpers');
const storage = helpers.dependencies.storage;
const database = storage.database;
const { getLogger } = require('@pryv/boiler');

const compareIndexes = exports.compareIndexes = function (expected, actual) {
  expected.forEach((index) => {
    index.index = _.extend(index.index, { userId: 1 });
  });
  expected.push({ index: { userId: 1 }, options: {} });

  expected.forEach((expectedItem) => {
    let found = false;
    const expectedKeys = Object.keys(expectedItem.index);
    actual.forEach((index) => {
      const actualKeys = Object.keys(index.key);
      if ((_.difference(expectedKeys, actualKeys).length + _.difference(actualKeys, expectedKeys).length) === 0) {
        found = true; 
      }
    });
    if (! found) {
      throw new Error('Index expected not found:' + JSON.stringify(expectedItem));
    }
  });
}

const getVersions = exports.getVersions = function getVersions(/* migration1Id, migration2Id, ... */) {
  const pickArgs = [].slice.call(arguments);
  pickArgs.unshift(migrations);
  const pickedMigrations = _.pick.apply(_, pickArgs);
  return new Versions(database,
      helpers.dependencies.settings.eventFiles.attachmentsDirPath,
      getLogger('versions'),
      pickedMigrations);
}

const applyPreviousIndexes = exports.applyPreviousIndexes = function (collectionName, indexes, callback) {
  async.forEachSeries(indexes, ensureIndex, function (err) {
    if (err) { return callback(err); }
    database.initializedCollections[collectionName] = true;
    callback();
  }.bind(this));

  function ensureIndex(item, itemCallback) {
    database.db.collection(collectionName)
      .createIndex(item.index, item.options, itemCallback);
  }
}