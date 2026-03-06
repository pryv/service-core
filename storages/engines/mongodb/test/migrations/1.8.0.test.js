/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Tests data migration between versions.
 */

const { promisify } = require('util');
const helpers = require('../../../../test/helpers');
const storage = helpers.dependencies.storage;
const database = storage.database;
const testData = helpers.data;

const assert = require('node:assert');
const { SystemStreamsSerializer, getUsersLocalIndex, platform, config } = helpers;
const mongoFolder = config.mongoFolder;

const { getVersions } = require('./util');

describe('[MG80] Migration - 1.8.0', function () {
  this.timeout(20000);
  let initialEventsUsers;
  let usersIndex;

  before(async function () {
    const newVersion = getVersions('1.8.0');
    await SystemStreamsSerializer.init();
    const restoreFromDumpAsync = promisify(testData.restoreFromDump);
    await restoreFromDumpAsync('1.7.5', mongoFolder);

    // collect users from events
    initialEventsUsers = await getInitialEventsUsers();

    // --- user Index
    usersIndex = await getUsersLocalIndex();
    await usersIndex.deleteAll();

    // --- erase platform wide db
    await platform.init();
    await platform.deleteAll();

    // perform migration
    await newVersion.migrateIfNeeded();
  });

  after(async () => {});

  it('[WBIK] must handle userIndex/events  migration from 1.7.5 to 1.8.0', async () => {
    // check that all users are migrated
    const newUsers = await usersIndex.getAllByUsername();
    for (const [username, userId] of Object.entries(initialEventsUsers)) {
      if (newUsers[username]) {
        assert.equal(newUsers[username], userId, `User ${username} migrated but with wrong id`);
      } else {
        assert.fail(`User ${userId} not migrated`);
      }
      delete initialEventsUsers[username];
    }
    assert.equal(Object.keys(initialEventsUsers).length, 0, 'Not all users migrated');
  });

  it('[PH6C] must handle userIndex/repository migration from 1.7.5 to 1.8.0', async () => {
    const { errors } = await usersIndex.checkIntegrity();
    assert.equal(errors.length, 0, 'Found error(s) in the userIndex vs events check');
  });

  it('[URHS] must handle platfrom migration from 1.7.5 to 1.8.0', async () => {
    const { errors } = await platform.checkIntegrity();
    assert.equal(errors.length, 0, 'Found error(s) in the platform vs Users check');
  });
});

async function getInitialEventsUsers () {
  const eventsCollection = await database.getCollection({ name: 'events' });
  const query = { streamIds: { $in: [':_system:username'] } };
  const cursor = eventsCollection.find(query, { projection: { userId: 1, content: 1 } });

  const users = {};
  while (await cursor.hasNext()) {
    const user = await cursor.next();
    users[user.content] = user.userId;
  }
  return users;
}
