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
const InfluxRepository = require('components/business/src/series/repository');
const DataMatrix = require('components/business/src/series/data_matrix');
const { getConfig } = require('components/api-server/config/Config');
const UsersRepository = require('components/business/src/users/repository');
const { databaseFixture } = require('components/test-helpers');
const {
  produceMongoConnection,
  produceInfluxConnection,
} = require('components/api-server/test/test-helpers');
const bluebird = require('bluebird');

let app;
let authKey;
let username1;
let username2;
let request;
let res;
let mongoFixtures;
let usersRepository;
let influx;
let influxRepository;

describe('DELETE /users/:username', () => {
  const settingsToTest = [[true, false], [false, false], [true, true]];
  for (let settingToTest of settingsToTest) {
    describe(`singleNode:isActive = ${settingToTest[0]}, openSource:isActive = ${settingToTest[1]}`, function() {
      before(async function() {
        const settings = await Settings.load();
        const config = getConfig();
        config.set('singleNode:isActive', settingToTest[0]);
        config.set('openSource:isActive', settingToTest[1]);
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

        influx = produceInfluxConnection(settings);
        influxRepository = new InfluxRepository(influx);

        usersRepository = new UsersRepository(app.storageLayer.events);

        await bluebird.fromCallback((cb) =>
          app.storageLayer.eventFiles.removeAll(cb)
        );

        username1 = charlatan.Internet.userName();
        username2 = charlatan.Internet.userName();

        authKey = settings.get('auth.adminAccessKey').str();
      });
      after(async function() {
        await mongoFixtures.context.cleanEverything();
        await bluebird.fromCallback((cb) =>
          app.storageLayer.eventFiles.removeAll(cb)
        );
      });
      it('[S1D3] should respond with 404 given invalid authorization key', async function() {
        res = await request.delete(`/users/${username1}`).set('Authorization', 'somekey');
        assert.equal(res.status, 404);
      });
      describe('when given existing username', function() {
        before(async function() {
          await initiateUserWithData(username1);
          await initiateUserWithData(username2);
          res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
        });
        it('[QU00] should respond with 200', function () {
          assert.equal(res.status, 200);
        });
        it('[PYT5] should delete user entries from impacted collections', async function() {
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

          const collectionsNotEmptyChecks = dbCollections.map(async function(
            coll
          ) {
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
        it('[FB1V] should delete user event files', async function() {
          const totalFilesSize = await bluebird.fromCallback((cb) =>
            app.storageLayer.eventFiles.getTotalSize({ id: username1 }, cb)
          );
          assert.equal(totalFilesSize, 0);
        });
        it('[W4I7] should not delete entries of other users', async function() {
          const user = await usersRepository.getById(username2);
          assert.exists(user);

          const dbCollections = [
            app.storageLayer.accesses,
            app.storageLayer.events,
            app.storageLayer.streams,
            app.storageLayer.webhooks,
          ];

          const collectionsEmptyChecks = dbCollections.map(async function(
            coll
          ) {
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
        it('[BJ4Z] should not delete other user event files', async function() {
          const totalFilesSize = await bluebird.fromCallback((cb) =>
            app.storageLayer.eventFiles.getTotalSize({ id: username2 }, cb)
          );
          assert.notEqual(totalFilesSize, 0);
        });
      });
      describe('when given not existing username', function() {
        before(async function() {
          res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
        });
        it('[7V8S] should respond with 404', function() {
          assert.equal(res.status, 404);
        });
      });
    });
  }
});

async function initiateUserWithData(username: string) {
  const user = await mongoFixtures.user(username);

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

  const usersSeries = await influxRepository.get(
    `${username}_namespace`,
    `${username}_name`
  );
  const data = new DataMatrix(
    ['deltaTime', 'value'],
    [
      [0, 10],
      [1, 20],
    ]
  );
  usersSeries.append(data);
}
