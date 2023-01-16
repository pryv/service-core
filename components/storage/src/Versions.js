/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const bluebird = require('bluebird');
const timestamp = require('unix-timestamp');
const packageFile = require('../package.json');
const migrations = require('./migrations/index');
const MigrationContext = require('./migrations/MigrationContext');

const collectionInfo = {
  name: 'versions',
  indexes: []
};

module.exports = Versions;
/**
 * Handles the DB and files storage version (incl. migrating between versions)
 *
 * Version info is in DB collection `versions`, each record structured as follows:
 *
 *    {
 *      "_id": "{major}.{minor}[.{revision}]
 *      "migrationStarted": "{timestamp}"
 *      "migrationCompleted": "{timestamp}"
 *    }
 *
 * TODO: must be per-user to properly support account relocation
 *
 * @param database
 * @param attachmentsDirPath
 * @param logging
 * @param migrationsOverride Use for tests
 * @constructor
 */
function Versions (database, attachmentsDirPath, logger, migrationsOverride) {
  this.database = database;
  this.attachmentsDirPath = attachmentsDirPath;
  this.migrations = migrationsOverride || migrations;
  this.logger = logger;
}

Versions.prototype.getCurrent = async function () {
  return await bluebird.fromCallback(function (cb) {
    this.database.findOne(collectionInfo, {}, { sort: { migrationCompleted: -1 } }, cb);
  }.bind(this));
};

Versions.prototype.migrateIfNeeded = async function () {
  const v = await this.getCurrent();
  let currentVNum = v?._id;
  if (!v) {
    // new install: init to package version
    currentVNum = packageFile.version;
    await bluebird.fromCallback(function (cb) {
      this.database.insertOne(collectionInfo, {
        _id: currentVNum,
        initialInstall: timestamp.now()
      }, cb);
    }.bind(this));
  }
  const migrationsToRun = Object.keys(this.migrations).filter(function (vNum) {
    return vNum > currentVNum;
  }).sort();
  const context = new MigrationContext({
    database: this.database,
    attachmentsDirPath: this.attachmentsDirPath,
    logger: this.logger
  });
  for (const migration of migrationsToRun) {
    await migrate.call(this, migration);
  }

  /**
   * @this {Versions}
   */
  async function migrate (vNum) {
    await bluebird.fromCallback(function (cb) {
      this.database.upsertOne(collectionInfo, { _id: vNum }, { $set: { migrationStarted: timestamp.now() } }, cb);
    }.bind(this));
    await bluebird.fromCallback(function (cb) {
      this.migrations[vNum](context, cb);
    }.bind(this));
    await bluebird.fromCallback(function (cb) {
      this.database.updateOne(collectionInfo, { _id: vNum }, { $set: { migrationCompleted: timestamp.now() } }, cb);
    }.bind(this));
  }
};

/**
 * For tests only.
 */
Versions.prototype.removeAll = async function () {
  await bluebird.fromCallback(function (cb) {
    this.database.deleteMany(collectionInfo, {}, cb);
  }.bind(this));
};
