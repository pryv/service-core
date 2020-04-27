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
const buildTree = require('components/utils').treeUtils.buildTree;

describe('Versions', function () {
  this.timeout(20000);

  const mongoFolder = __dirname + '/../../../../../mongo-bin';

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

  it.skip('must handle data migration from v1.3.37 to 1.3.40', function (done) {
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

        if (a.deleted !== null) {
          if (a['_token'] != null) throw new Error('all deleted accesses should have "token" parameter and not "_token"');
          if (a['_type'] != null) throw new Error('all deleted accesses should have "type" parameter and not "_type"');
          if (a['_name'] != null) throw new Error('all deleted accesses should have "name" parameter and not "_name"');
          if (a['_deviceName'] != null) throw new Error('all deleted accesses should have "deviceName" parameter and not "_deviceName"');
        }
      });

      done();
    });
  });


  it.skip('[CRPD] must handle data migration from v1.3.40 to 1.4.0', function (done) {
    const versions = getVersions('1.4.0');
    const oldIndexes = testData.getStructure('1.3.40').indexes;

    const user = { id: 'u_0' };
    const userEvents = storage.user.events;
    const userStreams = storage.user.streams;
    const userAccesses = storage.user.accesses;
    const userProfile = storage.user.profile;
    const userFollowedSlices = storage.user.followedSlices;

    async.series([
      (cb) => testData.restoreFromDump('1.3.40', mongoFolder, cb),

      (cb) => getResourcesOld(user, 'events', cb), // (a), see below
      (cb) => getResourcesOld(user, 'streams', cb), // (b), see below
      (cb) => getResourcesOld(user, 'accesses', cb), // (c), see below
      (cb) => getResourcesOld(user, 'profile', cb), // (d), see below
      (cb) => getResourcesOld(user, 'followedSlices', cb), // (e), see below

      (cb) => versions.migrateIfNeeded(cb),

      (cb) => userEvents.listIndexes(user, {}, cb), // (f), see below
      (cb) => userStreams.listIndexes(user, {}, cb), // (g), see below
      (cb) => userAccesses.listIndexes(user, {}, cb), // (h), see below
      (cb) => userProfile.listIndexes(user, {}, cb), // (i), see below
      (cb) => userFollowedSlices.listIndexes(user, {}, cb), // (j), see below

      (cb) => userEvents.findAll(user, {}, cb), // (k), see below
      (cb) => userStreams.findAll(user, {}, cb), // (l), see below
      (cb) => userAccesses.findAll(user, {}, cb), // (m), see below
      (cb) => userProfile.findAll(user, {}, cb), // (n), see below
      (cb) => userFollowedSlices.findAll(user, {}, cb), // (o), see below

      (cb) => versions.getCurrent(cb), // (p), see below
    ], function (err, res) {
      assert.isNull(err, 'there was an error');

      const oldEvents = fixProperties(res[1]); // (a)
      const oldStreams = fixProperties(res[2], 'streams'); // (b)
      const oldAccesses = fixProperties(res[3], 'accesses'); // (c)
      const oldProfile = fixProperties(res[4], 'profile'); // (d)
      const oldFollowedSlices = fixProperties(res[5]); // (e)

      const eventsIndexes = res[7]; // (f)
      const streamsIndexes = res[8]; // (g)
      const accessesIndexes = res[9]; // (h)
      const profileIndexes = res[10]; // (i)
      const followedSlicesIndexes = res[11]; // (j)

      const events = res[12]; // (k)
      const streams = res[13]; // (l)
      const accesses = res[14]; // (m)
      const profile = res[15]; // (n)
      const followedSlices = res[16]; // (o)

      const version = res[17]; // (p)
      

      compareIndexes(oldIndexes.events, eventsIndexes);
      compareIndexes(oldIndexes.streams, streamsIndexes);
      compareIndexes(oldIndexes.accesses, accessesIndexes);
      compareIndexes(oldIndexes.profile, profileIndexes);
      compareIndexes(oldIndexes.followedSlices, followedSlicesIndexes);
      
      compareData(oldEvents, events);
      compareData(oldStreams, streams);
      compareData(oldAccesses, accesses);
      compareData(oldProfile, profile);
      compareData(oldFollowedSlices, followedSlices);

      assert.strictEqual(version._id, '1.4.0');
      assert.isNotNull(version.migrationCompleted);

      done();
    });

    function fixProperties(items, resourceName) {

      items.forEach((item) => {
        item.id = item._id;
        delete item._id;
        delete item.endTime;
        if (item.deleted != null) item.deleted = new Date(item.deleted) / 1000;
        if (resourceName == 'accesses') {
          if (item.deleted === null) {
            delete item.deleted;
          }
        }
      });
  
      if (resourceName == 'streams') {
        items = buildTree(items);
      }
  
      return items;
    }

    function compareData(oldData, newData) {
      oldData.forEach((oldResource) => {
        let found = false;
        newData.forEach((resource) => {
          if (_.isEqual(resource, oldResource)) {
            found = true;
          }
        });
      });
    }

    async function getResourcesOld(user, resourceName, callback) {
      let resourceCol;
      await database.getCollection({
        name: user.id + '.' + resourceName
      }, (err, col) => {
        if (err) return callback(err);
        resourceCol = col;
      });
      const resources = await resourceCol.find({}).toArray();
      return callback(null, resources);
    }
  });

  it('[CRPX] must handle data migration from v1.4.0 to 1.5.0', function (done) {
    const versions = getVersions('1.5.0');
    const indexesWithoutUsers = testData.getStructure('1.5.0').indexes;
  
    const user = { id: 'u_0' };
    const userEventsStorage = storage.user.events;

    async.series([
      (cb) => testData.restoreFromDump('1.4.0', mongoFolder, cb),
      (cb) => versions.migrateIfNeeded(cb),
      (cb) => userEventsStorage.listIndexes(user, {}, cb), // (c)
      (cb) => versions.getCurrent(cb), // (d), see below
    ], function (err, res) {
      assert.isNull(err, 'there was an error');
      const eventsIndexes = res[2]; // (c)
      const version = res[3]; //(d)
    
      assert.strictEqual(version._id, '1.5.0');
      assert.isNotNull(version.migrationCompleted);
      compareIndexes(indexesWithoutUsers.events, eventsIndexes);
      done();
    });
  });

  function compareIndexes(expected, actual) {
    expected.forEach((index) => {
      index.index = _.extend(index.index, { userId: 1 });
    });
    expected.push({ index: { userId: 1 }, options: {} });

    expected.forEach((expectedItem) => {
      let found = false;
      actual.forEach((index) => {
        if (_.isEqual(index.key, expectedItem.index)) {
          found = true;
        }
      });
      if (! found) {
        throw new Error('Index expected not found:' + JSON.stringify(expectedItem));
      }
    });
  }

  function getVersions(/* migration1Id, migration2Id, ... */) {
    const pickArgs = [].slice.call(arguments);
    pickArgs.unshift(migrations);
    const pickedMigrations = _.pick.apply(_, pickArgs);
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
