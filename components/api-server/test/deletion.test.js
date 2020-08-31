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
let username1;
let username2;
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

    username1 = charlatan.Internet.userName();
    username2 = charlatan.Internet.userName();
  });
  after(async function() {
    await mongoFixtures.context.cleanEverything();
    await bluebird.fromCallback((cb) =>
      app.storageLayer.eventFiles.removeAll(cb));
  });
  describe('when given existing username', function() {
    before(async function() {
      await initiateUserWithData(username1);
      await initiateUserWithData(username2);
      res = await request.delete(`/users/${username1}`);
    });
    it('should respond with 200', function() {
      assert.equal(res.status, 200);
    });
    it('should delete user entries from impacted collections', async function() {
      const user = await usersRepository.getById(username1);
      assert.notExists(user);

      const dbCollections = [
        app.storageLayer.accesses,
        app.storageLayer.events,
        app.storageLayer.streams,
        app.storageLayer.followedSlices,
        app.storageLayer.profile,
        app.storageLayer.webhooks,
      ];

      const collectionsNotEmptyChecks = dbCollections.map(async function(coll) {
        const collectionEntriesForUser = await bluebird.fromCallback((cb) =>
          coll.find({ id: username1 }, {}, {}, cb)
        );
        assert.empty(collectionEntriesForUser);
      });

      await Promise.all(collectionsNotEmptyChecks);

      const sessions = await bluebird.fromCallback((cb) =>
        app.storageLayer.sessions.getMatching({ username: username1 }, cb)
      );
      assert(sessions === null || sessions === []);
    });
    it('should delete user event files', async function() {
      const totalFilesSize = await bluebird.fromCallback((cb) =>
        app.storageLayer.eventFiles.getTotalSize({id: username1}, cb));
      assert.equal(totalFilesSize, 0);
    });
    it('should not delete entries of other users', async function() {
      const user = await usersRepository.getById(username2);
      assert.exists(user);

      const dbCollections = [
        app.storageLayer.accesses,
        app.storageLayer.events,
        app.storageLayer.streams,
        app.storageLayer.webhooks,
      ];

      const collectionsEmptyChecks = dbCollections.map(async function(coll) {
        const collectionEntriesForUser = await bluebird.fromCallback((cb) =>
          coll.find({ id: username2 }, {}, {}, cb)
        );
        assert.notEmpty(collectionEntriesForUser);
      });

      await Promise.all(collectionsEmptyChecks);

      const sessions = await bluebird.fromCallback((cb) =>
        app.storageLayer.sessions.getMatching({ username: username2 }, cb)
      );
      assert(sessions !== null || sessions !== []);
    });
    it('should not delete other user event files', async function() {
      const totalFilesSize = await bluebird.fromCallback((cb) =>
        app.storageLayer.eventFiles.getTotalSize({id: username2}, cb));
      assert.notEqual(totalFilesSize, 0);
    });
  });
  describe('when given not existing username', function() {
    before(async function() {
      res = await request.delete(`/users/${username1}`);
    });
    it('should respond with 404', function() {
      assert.equal(res.status, 404);
    });
  });
});

async function initiateUserWithData(username: string) {
  const user = await mongoFixtures.user(username);

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
      { id: username },
      charlatan.Lorem.word(),
      charlatan.Lorem.word(),
      cb
    )
  );
}
