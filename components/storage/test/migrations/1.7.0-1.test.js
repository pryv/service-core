/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
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
const migrations = require('../../src/migrations');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getLogger } = require('@pryv/boiler');
const { TAG_ROOT_STREAMID, TAG_PREFIX } = require('api-server/src/methods/helpers/backwardCompatibility');

const mongoFolder = __dirname + '../../../../../var-pryv/mongodb-bin'

const { getVersions, compareIndexes, applyPreviousIndexes } = require('./util');


describe('Migration - 1.7.x',function () {
  this.timeout(20000);

  let eventsCollection;
  let usersCollection;
  let streamsCollection;
  let accessesCollection;
  let webhooksCollection;

  before(async function() {
    eventsCollection = await database.getCollection({ name: 'events' });
    usersCollection = await database.getCollection({ name: 'users' });
    streamsCollection = await database.getCollection({ name: 'streams' });
    accessesCollection = await database.getCollection({ name: 'accesses' });
    webhooksCollection = await database.getCollection({ name: 'webhooks' });
  });

  after(async function() {
    // erase all
    await eventsCollection.deleteMany({});
    await accessesCollection.deleteMany({});
  });

  it('[V8JR] must handle data migration from 1.6.21 to 1.7.1', async function () {
    const versions0 = getVersions('1.7.0');
    const versions1 = getVersions('1.7.1');
    const newIndexes = testData.getStructure('1.7.0').indexes;
    const defaultUser = { id: 'u_0' };

    const systemStreamIds = SystemStreamsSerializer.getAllSystemStreamsIds();

    await bluebird.fromCallback(cb => testData.restoreFromDump('1.6.21', mongoFolder, cb));

    // get backup of users
    const usersCursor = usersCollection.find({});
    const users = await usersCursor.toArray();

    // for tags keeps info on existings tags & events
    const previousEventsWithTags = await eventsCollection.find({ tags: { $exists: true, $ne: [] } }).toArray();
    const previousAccessesWithTags = await accessesCollection.find({ 'permissions.tag': { $exists: true } }).toArray();

    // deleted
    const collectionsWithDelete = [eventsCollection, accessesCollection, streamsCollection, webhooksCollection];
    const previousItemsWithDelete = {};
    for (const collection of collectionsWithDelete) {
      previousItemsWithDelete[collection.namespace] = await collection.find({ deleted: { $type: 'date' } }).toArray();
    }

    // perform migration
    await versions0.migrateIfNeeded();
    await versions1.migrateIfNeeded();
    // verify that user accounts were migrated to events
    for (const user of users) {
      // we must verify that all system streamIds were translated to another prefix
      const eventsCursor = eventsCollection.find({
        // streamIds: {$in: userAccountStreamIds},
        userId: { $eq: user._id }
      });

      const events = await eventsCursor.toArray();

      const uniqueProperties = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix();
      const UNIQUE_SUFFIX = '__unique';

      for (const event of events) {
        for (const streamId of event.streamIds) {
          assert.isFalse(streamId.startsWith(DOT), `streamId ${streamId} of event ${event} starts with a dot when it should not.`);
        }
        for (const uniqueProp of uniqueProperties) {
          assert.notExists(event[uniqueProp + UNIQUE_SUFFIX], `unique property `)
        }
      }

    }

    const migratedIndexes = await bluebird.fromCallback(cb => eventsCollection.listIndexes({}).toArray(cb));
    compareIndexes(newIndexes.events, migratedIndexes);


    // ----------------- tag migrations
    const eventsWithTags = await eventsCollection.find({ tags: { $exists: true, $ne: [] } }).toArray();
    assert.equal(eventsWithTags.length, 0);
    for (event of previousEventsWithTags) {
      const newEvent = await eventsCollection.findOne({ _id: event._id });
      // check if tags have been added to streamIds
      for (tag of event.tags) {
        assert.include(newEvent.streamIds, TAG_PREFIX + tag);
      }
      // check if stream exists for this user
      const stream = await streamsCollection.findOne({userId: event.userId, streamId: TAG_PREFIX + tag});
      assert.exists(stream);
      assert.equal(stream.parentId, TAG_ROOT_STREAMID);
    }

    //-- permissions
    const permissionsWithTags = await accessesCollection.find({ 'permissions.tag': { $exists: true } }).toArray();
    assert.equal(permissionsWithTags.length, 0);

    for (const previousAccess of previousAccessesWithTags) {

      const newAccess = await accessesCollection.findOne({ _id: previousAccess._id });
      const forcedStreamsPerms = newAccess.permissions.filter(p => ( p.feature && p.feature == 'forcedStreams'));
      assert.equal(forcedStreamsPerms.length, 1);
      const forcedStreams = forcedStreamsPerms[0].streams;
      assert.isAbove(forcedStreams.length, 0);
      for (const permission of previousAccess.permissions) {
        if (permission.tag)
          assert.include(forcedStreams, TAG_PREFIX + permission.tag);
      }
    }


    // -----------------  deleted  migrations

    for (const collection of collectionsWithDelete) {
      const newItems = await collection.find({ deleted: { $type: 'date' } }).toArray();
      assert.equal(newItems.length, 0, collection.namespace + ' should have no item with deleted dates' );

      for (const previousItem of previousItemsWithDelete[collection.namespace]) {
        const newItem = await collection.findOne({ _id: previousItem._id });
        assert.equal(newItem.deleted, previousItem.deleted.getTime() / 1000);
      }
    }
  });

});
