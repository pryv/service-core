/**
 * Tests data migration between versions.
 */

/*global describe, it */

const helpers = require('components/test-helpers');
const storage = helpers.dependencies.storage;
const converters = require('../src/converters');
const database = storage.database;
const async = require('async');
const migrations = require('../src/migrations');
const should = require('should');
const assert = require('chai').assert;
const testData = helpers.data;
const Versions = require('../src/Versions');
const wrench = require('wrench');
const _ = require('lodash');

describe('Versions', function () {
  this.timeout(20000);

  var mongoFolder = __dirname + '/../../../../../mongodb-osx-x86_64-3.4.4';

  // older migration tests are skipped; they're kept for reference (e.g. when
  // writing new tests)

  it.skip('must handle data migration from v0.2.0 to v0.3.0 (skipped, obsolete)', function (done) {
    var versions = getVersions('0.2.0', '0.3.0'),
        user = {id: 'u_0'};

    var extraEvent = {
      id: 'extra',
      channelId: 'c_3',
      folderId: null,
      time: 1374036000,
      type: { class: 'temperature', format: 'c' },
      value: 37.2,
      tags: [],
      modified: 1374036000
    };
    var extraEventMigrated = {
      id: 'extra',
      streamId: 'c_3',
      time: 1374036000,
      type: 'temperature/c',
      content: 37.2,
      tags: [],
      modified: 1374036000
    };

    var expected = {
      accesses: require('../../test-helpers/src/data/migrated/0.3.0/accesses').slice(),
      events: require('../../test-helpers/src/data/migrated/0.3.0/events')
        .concat(extraEventMigrated),
      streams: require('../../test-helpers/src/data/migrated/0.3.0/streams').slice(),
      attachments: require('../../test-helpers/src/data/migrated/0.3.0/attachments').slice()
    };

    async.series({
      restore: testData.restoreFromDump.bind(null, '0.2.0', mongoFolder),
      insertExtraEvent: storage.user.events.insertMany.bind(storage.user.events, user,
        [extraEvent]),
      migrate: versions.migrateIfNeeded.bind(versions),
      // use raw database to avoid new indexes being applied on old data structure
      accesses: storage.database.find.bind(storage.database,
        { name: user.id + '.accesses', indexes: [] }, {}, { sort: {name: 1} }),
      streams: storage.user.streams.findAll.bind(storage.user.streams, user, {}),
      events: storage.user.events.findAll.bind(storage.user.events, user, {}),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);

      results.accesses.forEach(converters.getRenamePropertyFn('_id', 'token').bind(null, null));
      expected.accesses.sort(function (a, b) { return a.name.localeCompare(b.name); });
      results.accesses.should.eql(expected.accesses);

      expected.streams.sort(function (a, b) { return a.name.localeCompare(b.name); });
      results.streams.should.eql(expected.streams);

      expected.events.sort(function (a, b) {
        // HACK: empirically determined: sort by id if equal time
        return (b.time - a.time) || b.id.localeCompare(a.id);
      });
      results.events.should.eql(expected.events);

      // check event files
      wrench.readdirSyncRecursive(helpers.dependencies.settings.eventFiles.attachmentsDirPath)
        .should.eql(expected.attachments);

      results.version._id.should.eql('0.3.0');
      should.exist(results.version.migrationCompleted);

      done();
    });
  });

  it.skip('must handle data migration from v0.3.0 to v0.4.0 (skipped, obsolete)', function (done) {
    var versions = getVersions('0.4.0'),
        user = {id: 'u_0'};

    var expected = {
      accesses: require('../../test-helpers/src/data/migrated/0.4.0/accesses').slice()
    };

    async.series({
      restore: testData.restoreFromDump.bind(null, '0.3.0', mongoFolder),
      migrate: versions.migrateIfNeeded.bind(versions),
      accesses: storage.user.accesses.findAll.bind(storage.user.accesses, user, {}),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);

      expected.accesses.sort(function (a, b) { return a.name.localeCompare(b.name); });
      results.accesses.should.eql(expected.accesses);

      results.version._id.should.eql('0.4.0');
      should.exist(results.version.migrationCompleted);

      done();
    });
  });

  it.skip('must handle data migration from v0.4.0 to v0.5.0 (skipped, obsolete)', function (done) {
    var versions = getVersions('0.5.0'),
        user = {id: 'u_0'};

    var expected = {
      events: require('../../test-helpers/src/data/migrated/0.5.0/events').slice()
    };

    async.series({
      restore: testData.restoreFromDump.bind(null, '0.4.0', mongoFolder),
      migrate: versions.migrateIfNeeded.bind(versions),
      events: storage.user.events.findAll.bind(storage.user.events, user, {}),
      followedSlices: storage.user.followedSlices.findAll.bind(storage.user.followedSlices, user,
        {}),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);

      expected.events.sort(function (a, b) {
        // HACK: empirically determined: sort by id if equal time
        return (b.time - a.time) || b.id.localeCompare(a.id);
      });
      results.events.should.eql(expected.events);

      results.followedSlices.length.should.be.above(0);

      results.version._id.should.eql('0.5.0');
      should.exist(results.version.migrationCompleted);

      done();
    });
  });

  it.skip('must handle data migration from v0.5.0 to v0.7.0', function (done) {
    var versions = getVersions('0.7.0'),
        userId = 'u_0',
        usersStorage = helpers.dependencies.storage.users;

    async.series({
      // don't restore, just use the current state (i.e. v0.5.0)
      removeIrrelevantUsers: usersStorage.remove.bind(usersStorage, {id: {$ne: userId}}),
      migrate: versions.migrateIfNeeded.bind(versions),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);

      // actual migration is implicitly tested via pryvuser tests,
      // which fail (when resetting streams) if run after incorrect v0.7.0 migration

      results.version._id.should.eql('0.7.0');
      should.exist(results.version.migrationCompleted);

      done();
    });
  });

  it.skip('must handle data migration from v0.7.0 to v0.7.1', function (done) {
    var versions = getVersions('0.7.1'),
        user = {id: 'ciya1zox20000ebotsvzyl8cx'};

    async.series({
      restore: testData.restoreFromDump.bind(null, '0.7.0', mongoFolder),
      migrate: versions.migrateIfNeeded.bind(versions),
      streams: storage.user.streams.findAll.bind(storage.user.streams, user, {}),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);

      results.streams.forEach(function (stream) {
        if (stream.parentId !== null && ! stream.deleted) {
          stream.parentId.should.not.eql('');
        }
      });

      results.version._id.should.eql('0.7.1');
      should.exist(results.version.migrationCompleted);
      done();
    });

  });

  it.skip('must handle data migration from v0.7.1 to 1.2.0', function (done) {
    const versions = getVersions('1.2.0');
    const user = {id: 'u_0'};

    const indexes = testData.getStructure('0.7.1').indexes;

    async.series({
      restore: testData.restoreFromDump.bind(null, '0.7.1', mongoFolder),
      indexEvents: applyPreviousIndexes.bind(null, 'events', indexes.events),
      indexStreams: applyPreviousIndexes.bind(null, 'streams', indexes.streams),
      indexAccesses: applyPreviousIndexes.bind(null, 'events', indexes.accesses),
      migrate: versions.migrateIfNeeded.bind(versions),
      events: storage.user.events.listIndexes.bind(storage.user.events, user, {}),
      streams: storage.user.streams.listIndexes.bind(storage.user.streams, user, {}),
      accesses: storage.user.accesses.listIndexes.bind(storage.user.accesses, user, {}),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);
      should.equal(_.findIndex(results.events, (o) => {return o.key.deleted === 1;}), -1);
      should.equal(_.findIndex(results.streams, (o) => {return o.key.deleted === 1;}), -1);
      should.equal(_.findIndex(results.accesses, (o) => {return o.key.deleted === 1;}), -1);
      results.version._id.should.eql('1.2.0');
      should.exist(results.version.migrationCompleted);
      done();
    });
  });

  it.skip('must handle data migration from v1.2.0 to v1.2.5', function (done) {
    const versions = getVersions('1.2.5');
    const indexes = testData.getStructure('1.2.4').indexes;

    const user = {id: 'u_0'};
    const userEvents = storage.user.events; 

    async.series([
      (cb) => testData.restoreFromDump('1.2.4', mongoFolder, cb), 
      (cb) => applyPreviousIndexes('events', indexes.events, cb),
      (cb) => versions.migrateIfNeeded(cb),
      (cb) => userEvents.listIndexes(user, {}, cb), // (a), see below
      (cb) => versions.getCurrent(cb), // (b), see below
    ], function (err, res) {
      assert.isNull(err, 'there was an error');
      
      const events = res[3]; // (a)
      const version = res[4]; // (b)

      const eventEndTimeIndex = 
        _.findIndex(events, (o) => o.key.endTime === 1);
      
      assert.isAtLeast(eventEndTimeIndex, 0);
      assert.strictEqual(version._id, '1.2.5');
      assert.isNotNull(version.migrationCompleted);

      done();
    });
  });

  it('must handle data migration from v1.3.37 to 1.3.40', function (done) {
    const versions = getVersions('1.3.40');
    const indexes = testData.getStructure('1.3.37').indexes;

    const user = {id: 'u_0'};
    const userAccesses = storage.user.accesses; 

    async.series([
      (cb) => testData.restoreFromDump('1.3.37', mongoFolder, cb), 
      (cb) => applyPreviousIndexes('accesses', indexes.accesses, cb),
      (cb) => versions.migrateIfNeeded(cb),
      (cb) => userAccesses.listIndexes(user, {}, cb), // (a), see below
      (cb) => versions.getCurrent(cb), // (b), see below
      (cb) => userAccesses.findAll(user, {}, cb), // (c), see below
    ], function (err, res) {
      assert.isNull(err, 'there was an error');
      
      const accessIndexes = res[3]; // (a)
      const version = res[4]; // (b)
      const accesses = res[5]; // (c)

      const tokenIndex = 
        _.findIndex(accessIndexes, (o) => o.key.token === 1);
      const otherIndex =
        _.findIndex(accessIndexes, (o) => {
          return o.key.name === 1 &&
          o.key.type === 1 &&
          o.key.deviceName === 1
      });

      assert.isAtLeast(tokenIndex, 0, 'token index not found');
      assert.isAtLeast(otherIndex, 0, 'other index not found');

      const tokenPartialFilter = accessIndexes[tokenIndex].partialFilterExpression;
      const otherPartialFilter = accessIndexes[otherIndex].partialFilterExpression;
      
      assert.isNotNull(tokenPartialFilter.deleted);
      assert.isNotNull(otherPartialFilter.deleted);
    
      assert.strictEqual(version._id, '1.3.40');
      assert.isNotNull(version.migrationCompleted);

      accesses.forEach((a) => {
        if (a.deleted === undefined) throw new Error('all access.deleted fields should either be set to a date or be null');
      });

      done();
    });
  });

  function getVersions(/* migration1Id, migration2Id, ... */) {
    var pickArgs = [].slice.call(arguments);
    pickArgs.unshift(migrations);
    var pickedMigrations = _.pick.apply(_, pickArgs);
    return new Versions(database,
        helpers.dependencies.settings.eventFiles.attachmentsDirPath,
        helpers.dependencies.logging.getLogger('versions'),
        pickedMigrations);
  }

  function applyPreviousIndexes(collectionName, indexes, callback) {
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

});
