/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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
const migrations = require('../../src/migrations');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getLogger } = require('@pryv/boiler');

const mongoFolder = __dirname + '../../../../../../var-pryv/mongodb-bin'

const { getVersions, compareIndexes, applyPreviousIndexes } = require('./util');

describe('Migration - 1.7.0', function () {
  this.timeout(20000);

  it('[V8JR] must handle data migration from 1.6.21 to 1.7.0', async function () {
    const versions = getVersions('1.7.0');
    const newIndexes = testData.getStructure('1.7.0').indexes;
    const defaultUser = { id: 'u_0' };
    const eventsStorage = storage.user.events;
    const eventsCollection = await bluebird.fromCallback(cb => database.getCollection({ name: 'events' }, cb));
    const usersCollection = await bluebird.fromCallback(cb => database.getCollection({ name: 'users' }, cb));

    const systemStreamIds = SystemStreamsSerializer.getAllSystemStreamsIds(); 

    // perform migration
    await bluebird.fromCallback(cb => testData.restoreFromDump('1.6.21', mongoFolder, cb));

    // get backup of users
    const usersCursor = await bluebird.fromCallback(cb => usersCollection.find({}, cb));
    const users = await usersCursor.toArray();

    await bluebird.fromCallback(cb => versions.migrateIfNeeded(cb));
    // verify that user accounts were migrated to events
    for(const user of users) {
      // we must verify that all system streamIds were translated to another prefix
      const eventsCursor = await bluebird.fromCallback(cb => eventsCollection.find(
        {
          //streamIds: {$in: userAccountStreamIds},
          userId: { $eq: user._id },
        }, cb));
      
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

    const migratedIndexes = await bluebird.fromCallback(cb => eventsStorage.listIndexes(defaultUser, {}, cb));
    compareIndexes(newIndexes.events, migratedIndexes);
  });

});
