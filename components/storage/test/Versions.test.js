/**
 * Tests data migration between versions.
 */

/*global describe, it */

var helpers = require('components/test-helpers'),
    storage = helpers.dependencies.storage,
    converters = require('../src/converters'),
    database = storage.database,
    async = require('async'),
    migrations = require('../src/migrations'),
    should = require('should'), // explicit require to benefit from static functions
    testData = helpers.data,
    Versions = require('../src/Versions'),
    wrench = require('wrench'),
    _ = require('lodash');

describe('Versions', function () {

  var mongoFolder = __dirname + '/../../../../mongodb-osx-x86_64-2.6.0';

  // older migration tests are skipped; they're kept for reference (e.g. when writing new tests)

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
          { name: user.id + '.accesses', indexes: [] }, {}, { fields: {}, sort: {name: 1} }),
      streams: storage.user.streams.findAll.bind(storage.user.streams, user, {}),
      events: storage.user.events.findAll.bind(storage.user.events, user, {}),
      version: versions.getCurrent.bind(versions)
    }, function (err, results) {
      should.not.exist(err);

      results.accesses.forEach(converters.getRenamePropertyFn('_id', 'token').bind(null, null));
      expected.accesses.sort(function (a, b) { return a.name.localeCompare(b.name); });
      results.accesses.should.eql(expected.accesses);

      expected.streams.sort(function (a, b) { return a.name.localeCompare(b.name); });
      results.streams.should.eql(expected.streams);

      expected.events.sort(function (a, b) {
        // HACK: empirically determined: sort by id if equal time
        return (b.time - a.time) || b.id.localeCompare(a.id);
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

      expected.accesses.sort(function (a, b) { return a.name.localeCompare(b.name); });
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
        return (b.time - a.time) || b.id.localeCompare(a.id);
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

  it('must handle data migration from v0.7.0 to v0.7.1', function (done) {
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
        if (stream.parentId !== null) {
          stream.parentId.should.not.eql('');
        }
      });

      results.version._id.should.eql('0.7.1');
      should.exist(results.version.migrationCompleted);
      done();
    });

  });

  function getVersions(/* migration1Id, migration2Id, ... */) {
    var pickArgs = [].slice.call(arguments);
    pickArgs.unshift(migrations);
    var pickedMigrations = _.pick.apply(_, pickArgs);
    return new Versions(database,
        helpers.dependencies.settings.eventFiles.attachmentsDirPath,
        helpers.dependencies.logging,
        pickedMigrations);
  }

});
