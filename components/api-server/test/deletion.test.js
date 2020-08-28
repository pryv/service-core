/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const fs = require('fs');
const path = require('path');
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
let userId;
let otherUserId;
let request;
let res;
let mongoFixtures;
let usersRepository;

describe.only('DELETE /users', () => {
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
    await mongoFixtures.context.cleanEverything();
    usersRepository = new Repository(app.storageLayer.events);

    await bluebird.fromCallback((cb) =>
      app.storageLayer.eventFiles.removeAll(cb));

    userId = charlatan.Internet.userName();
    otherUserId = charlatan.Internet.userName();
  });
  after(async function() {
    await mongoFixtures.context.cleanEverything();
    await bluebird.fromCallback((cb) =>
      app.storageLayer.eventFiles.removeAll(cb));
  });
  describe('when given existing user id', function() {
    before(async function() {
      await initiateUserWithData(userId);
      await initiateUserWithData(otherUserId);
      res = await request.delete(`/users/${userId}`);
    });
    it('should respond with 200', function() {
      assert.equal(res.status, 200);
    });
    it('should delete user entries from impacted collections', async function() {
      const user = await usersRepository.getById(userId);
      assert.notExists(user);

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
          coll.find({ id: userId }, {}, {}, cb)
        );
        assert.empty(collectionEntriesForUser);
      });

      await Promise.all(collectionsEmptyChecks);

      const sessions = await bluebird.fromCallback((cb) =>
        app.storageLayer.sessions.getMatching({ username: userId }, cb)
      );
      assert(sessions === null || sessions === []);
    });
    it('should delete user event files', async function() {
      const totalFilesSize = await bluebird.fromCallback((cb) =>
        app.storageLayer.eventFiles.getTotalSize({id: userId}, cb));
      assert.equal(totalFilesSize, 0);
    });
    it('should not delete entries of other users', async function() {
      const user = await usersRepository.getById(otherUserId);
      assert.exists(user);

      const dbCollections = [
        app.storageLayer.accesses,
        app.storageLayer.events,
        app.storageLayer.streams,
        app.storageLayer.webhooks,
      ];

      const collectionsEmptyChecks = dbCollections.map(async function(coll) {
        const collectionEntriesForUser = await bluebird.fromCallback((cb) =>
          coll.find({ id: otherUserId }, {}, {}, cb)
        );
        assert.notEmpty(collectionEntriesForUser);
      });

      await Promise.all(collectionsEmptyChecks);

      const sessions = await bluebird.fromCallback((cb) =>
        app.storageLayer.sessions.getMatching({ username: otherUserId }, cb)
      );
      assert(sessions !== null || sessions !== []);
    });
    it('should not delete other user event files', async function() {
      const totalFilesSize = await bluebird.fromCallback((cb) =>
        app.storageLayer.eventFiles.getTotalSize({id: otherUserId}, cb));
      assert.notEqual(totalFilesSize, 0);
    });
  });
  describe('when given not existing user id', function() {
    before(async function() {
      res = await request.delete(`/users/${userId}`);
    });
    it('should respond with 404', function() {
      assert.equal(res.status, 404);
    });
  });
});

async function initiateUserWithData(id: string) {
  const user = await mongoFixtures.user(id);

  await usersRepository.insertOne(user);

  const stream = await user.stream({ id: charlatan.Lorem.word() });
  await stream.event({
    type: 'mass/kg',
    content: charlatan.Number.digit(),
  });

  user.access({ id: charlatan.Lorem.word() });
  user.session(charlatan.Lorem.word());
  user.webhook({ id: charlatan.Lorem.word() }, charlatan.Lorem.word());

  const filePath = 'test-file';
  fs.writeFileSync(filePath, 'Just some text');
  await bluebird.fromCallback((cb) =>
    app.storageLayer.eventFiles.saveAttachedFile(
      path.resolve(filePath),
      { id: id },
      charlatan.Lorem.word(),
      charlatan.Lorem.word(),
      cb
    )
  );
}
