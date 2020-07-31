/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, after, before, beforeEach */

const lodash = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');
const bluebird = require('bluebird');

const { Database,  } = require('components/storage');
const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');



import type { MongoDbSettings } from '../../../src/configuration';
const MongoDB = require('../../../src/connection/mongodb');

const chai = require('chai');
const assert = chai.assert;

const { databaseFixture } = require('components/test-helpers');


describe('Connection/MongoDB', () => {

    const settings: MongoDbSettings = {
    host: 'localhost',
    port: 27017,
    dbname: 'pryv-node-test',
    fileStore: {
      attachmentsPath: '/tmp/', 
      previewsPath: '/tmp/',
    },
  };

  const webhooksStorage = new storage.user.Webhooks(produceMongoConnection(settings));
  const eventsStorage = new storage.user.Events(produceMongoConnection(settings));
  const streamsStorage = new storage.user.Streams(produceMongoConnection(settings));
  const accessesStorage = new storage.user.Accesses(produceMongoConnection(settings));
  const profileStorage = new storage.user.Profile(produceMongoConnection(settings));
  const followedSlicesStorage = new storage.user.FollowedSlices(produceMongoConnection(settings));

  describe("when the user doesn't exist", () => {
    let mongodb;
    beforeEach(() => {
      mongodb = new MongoDB(settings);
    });

    describe('#preflight(username)', () => {
      it('[YU38] throws', async () => {
        try {
          await mongodb.preflight('somerandomstringthatisnotauser');
        }
        catch (err) {
          assert.match(err.message, /No such user/);

          return;
        }

        assert.fail('preflight throws an error');
      });
    });
  });

  describe('when given a user fixture', () => {
    // Uses dynamic fixtures:
    const mongoFixtures = databaseFixture(
      produceMongoConnection(
        settings));
    after(() => {
      mongoFixtures.clean();
    });

    // Set up a few ids that we'll use for testing. NOTE that these ids will
    // change on every test run.
    let userId, userId2, streamId, accessToken, validId;
    let hasExpiryId, hasExpiryToken;
    before(() => {
      userId = cuid();
      userId2 = cuid();
      streamId = cuid();
      accessToken = cuid();
      validId = cuid();
      hasExpiryId = cuid();
      hasExpiryToken = cuid();
    });

    // Build the fixture
    before(async () => {
      const user = await mongoFixtures.user(userId);
      const stream = await user.stream({ id: streamId });
      await stream.event({
        type: 'mass/kg',
        content: 4,
      });

      // A token that is still valid
      await user.access({
        id: hasExpiryId,
        type: 'app', token: hasExpiryToken,
        expires: timestamp.now('1d'),
        name: 'valid access',
        permissions: [
          {
            'streamId': 'diary',
            'defaultName': 'Diary',
            'level': 'read'
          }
        ]
      });

      // A token that did never expire
      let access = await user.access({
        id: validId,
        type: 'app', token: cuid(),
        name: 'doesnt expire',
      });
      access = access.attrs;
      await user.access({ token: accessToken, type: 'personal' });
      await user.session(accessToken);
      await user.webhook({
        accessId: access.id,
      });
    });

    let mongodb; 
    beforeEach(() => {
      mongodb = new MongoDB(settings);
    });

    describe('#preflight(username)', () => {
      it('[K52O] checks the connection and doesn\'t throw', async () => {
        await mongodb.preflight(userId); 
      });
    });
    describe('#deleteUser(username)', () => {
      it('[5NSD] deletes the user from MongoDB', async () => {
        await mongodb.deleteUser(userId);

        const user = await mongodb.findUser(userId);
        assert.isNull(user);
      });
      it('[47A6] deletes his data from MongoDB', async function() {
        await assertIsEmpty(eventsStorage, userId);
        await assertIsEmpty(streamsStorage, userId);
        await assertIsEmpty(accessesStorage, userId);
        await assertIsEmpty(webhooksStorage, userId);
        await assertIsEmpty(profileStorage, userId);
        // no fixtures implemented for followed slices
        //assertIsEmpty(followedSlicesStorage, userId);
      });
    });
  });

  // Produces and returns a connection to MongoDB. 
  // 
  function produceMongoConnection(settings: Object): Database {
    const copy = lodash.cloneDeep(settings);
    copy.name = copy.dbname;

    const database = new Database(
      copy,
      new NullLogger());

    return database;
  }
  
});

async function assertIsEmpty(storage, userId) {
  const items = await bluebird.fromCallback(cb =>
    storage.find({ id: userId }, {}, {}, cb)
  );
  items.forEach(i => {
    assert.notExists(i);
  });
}



