const async = require('async');
const timestamp = require('unix-timestamp');
const migrations = require('./migrations/index');
const MigrationContext = require('./migrations/MigrationContext');

const collectionInfo = {
  name: 'versions',
  indexes: [],
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
function Versions(database, attachmentsDirPath, logger, migrationsOverride) {
  this.database = database;
  this.attachmentsDirPath = attachmentsDirPath;
  this.migrations = migrationsOverride || migrations;
  this.logger = logger;
}

Versions.prototype.getCurrent = function (callback) {
  this.database.findOne(collectionInfo, {}, { sort: { migrationCompleted: -1 } }, (err, v) => {
    if (err) { return callback(err); }
    callback(null, v);
  });
};

Versions.prototype.migrateIfNeeded = function (callback) {
  this.getCurrent((err, v) => {
    if (err) { return callback(err); }

    const currentVNum = v ? v._id : '0.0.0';
    const migrationsToRun = Object.keys(this.migrations).filter((vNum) => vNum > currentVNum).sort();
    async.forEachSeries(migrationsToRun, migrate.bind(this), callback);
  });

  const context = new MigrationContext({
    database: this.database,
    attachmentsDirPath: this.attachmentsDirPath,
    logger: this.logger,
  });
  /**
   * @this {Versions}
   */
  function migrate(vNum, done) {
    async.series([
      function (stepDone) {
        const update = {
          $set: {
            migrationStarted: timestamp.now(),
          },
        };
        this.database.upsertOne(collectionInfo, { _id: vNum }, update, stepDone);
      }.bind(this),
      this.migrations[vNum].bind(null, context),
      function (stepDone) {
        const update = { $set: { migrationCompleted: timestamp.now() } };
        this.database.updateOne(collectionInfo, { _id: vNum }, update, stepDone);
      }.bind(this),
    ], done);
  }
};

/**
 * For tests only.
 */
Versions.prototype.removeAll = function (callback) {
  this.database.deleteMany(collectionInfo, {}, callback);
};
