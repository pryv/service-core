/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const assert = require('chai').assert;
const { describe, before, it, after } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');
const Settings = require('../src/settings');
const Application = require('../src/application');
const { getConfig } = require('components/api-server/config/Config');
const Repository = require('components/business/src/users/repository');
const { databaseFixture } = require('components/test-helpers');
const {
  produceMongoConnection,
} = require('components/api-server/test/test-helpers');
const bluebird = require('bluebird');

let app;
let deleteBody;
let request;
let res;
let mongoFixtures;
let usersRepository;

describe('DELETE /users', () => {
  before(async function() {
    const settings = await Settings.load();
    const config = getConfig();
    config.set('singleNode:isActive', true);
    config.set('openSource:isActive', false);
    app = new Application(settings);
    await app.initiate();

    require('../src/methods/auth/delete')(
      app.api,
      app.logging,
      app.storageLayer,
      app.settings
    );

    request = supertest(app.expressApp);

    mongoFixtures = databaseFixture(await produceMongoConnection());
    usersRepository = new Repository(app.storageLayer.events);

    deleteBody = {
      id: charlatan.Lorem.characters(7),
    };
  });
  describe('when given existing user id', function() {
    before(async function() {
      await initiateUserWithData(deleteBody.id);
      res = await request.delete('/users').send(deleteBody);
    });
    it.only('should respond with 200', function() {
      assert.equal(res.status, 200);
    });
    it('should delete user entries from impacted collections', async function() {
      // const user = await usersRepository.getById(deleteBody.id);
      // assert.notExists(user);

      const dbCollections = [
        app.storageLayer.accesses,
        app.storageLayer.events,
        app.storageLayer.streams,
        app.storageLayer.followedSlices,
        app.storageLayer.profile,
        app.storageLayer.webhooks,
      ];

      const collectionsEmptyChecks = dbCollections.map(async function(coll) {
        const collectionEntriesForUser = await bluebird.fromCallback((cb) =>
          coll.find({ id: deleteBody.id }, {}, {}, cb)
        );
        assert.empty(collectionEntriesForUser);
      });

      await Promise.all(collectionsEmptyChecks);

      const sessions = await bluebird.fromCallback((cb) =>
        app.storageLayer.sessions.getMatching({ username: deleteBody.id }, cb)
      );
      assert(sessions === null || sessions === []);
    });
  });
  describe('when given not existing user id', function() {
    before(async function() {
      res = await request.delete('/users').send(deleteBody);
    });
    it('should respond with 404', function() {
      assert.equal(res.status, 404);
    });
  });
});

async function initiateUserWithData(id: string) {
  const user = await mongoFixtures.user(id);

  await usersRepository.insertOne(user);

  const stream = await user.stream({ id: 'someIdStream' });
  await stream.event({
    type: 'mass/kg',
    content: 4,
  });
}
