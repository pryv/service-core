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

const mongoFolder = __dirname + '../../../../../../var-pryv/mongodb-bin';

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getVersions } = require('./util');

const { getUsersRepository } = require('business/src/users');

const userIndex = require('business/src/users/UserLocalIndex');


describe('Migration - 1.8.0',function () {
  this.timeout(20000);

  before(async function() { 
  });

  after(async function() {
    // erase alls
  });

  it('[WBIK] must handle data migration from 1.7.5 to 1.8.0', async function () {
    const newVersion = getVersions('1.8.0');
    const accessesStorage = storage.user.accesses;

    await bluebird.fromCallback(cb => testData.restoreFromDump('1.7.5', mongoFolder, cb));
    await userIndex.init();
    await userIndex.deleteAll();

    const initialUsers = await getInitialUsers();

     // perform migration
    await bluebird.fromCallback(cb => newVersion.migrateIfNeeded(cb));

    // check that all users are migrated
    const newUsers = await userIndex.allUsersMap();
    for ([username, userId] of Object.entries(initialUsers)) {
      if (newUsers[username]) {
        assert.equal(newUsers[username], userId, `User ${username} migrated but with wrong id`);
      } else {
        assert.fail(`User ${userId} not migrated`);
      }
      delete initialUsers[username];
    }
    assert.equal(Object.keys(initialUsers).length, 0, 'Not all users migrated');

    $$('initialUsers: %j', initialUsers, newUsers);
  });

});

async function getInitialUsers() {
  const usersRepository = await getUsersRepository();
  const eventsCollection = await bluebird.fromCallback(cb => database.getCollection({ name: 'events' }, cb));
  const query =  { streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] } };
  const cursor = await eventsCollection.find(query, {projection: {userId: 1, content: 1}});

  const users = {};
  while (await cursor.hasNext()) {
    const user = await cursor.next();
    users[user.content] = user.userId;
  }
  return users;
}