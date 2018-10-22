// @flow

/* global describe, it, after, before, beforeEach */

const lodash = require('lodash');
const cuid = require('cuid');
const timestamp = require('unix-timestamp');

const { Database } = require('components/storage');
const NullLogger = require('components/utils/src/logging').NullLogger;

import type { MongoDbSettings } from '../../../src/configuration';
const MongoDB = require('../../../src/connection/mongodb');

const { databaseFixture } = require('components/test-helpers');

describe('Connection/MongoDB', () => {
  const settings: MongoDbSettings = {
    host: 'localhost',
    port: 27017,
    dbname: 'pryv-node',
  };

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
    let userId, streamId, accessToken, validId;
    let hasExpiryId, hasExpiryToken;
    before(() => {
      userId = cuid();
      streamId = cuid();
      accessToken = cuid();
      validId = cuid();
      hasExpiryId = cuid();
      hasExpiryToken = cuid();
    });

    // Build the fixture
    before(() => {
      return mongoFixtures.user(userId, {}, function (user) {
        user.stream({ id: streamId }, (stream) => { 
          stream.event({
            type: 'mass/kg', 
            content: 4,
          });
        });

        // A token that is still valid
        user.access({
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
        user.access({
          id: validId,
          type: 'app', token: cuid(),
          name: 'doesnt expire',
        });

        user.access({ token: accessToken, type: 'personal' });
        user.session(accessToken);
      });
    });

    let mongodb; 
    beforeEach(() => {
      mongodb = new MongoDB(settings);
    });
 
    describe('#preflight(username)', () => {
      it("checks the connection and doesn't throw", async () => {
        await mongodb.preflight(userId); 
      });
    });
    describe('#deleteUser(username)', () => {
      it('deletes the user from MongoDB');
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

