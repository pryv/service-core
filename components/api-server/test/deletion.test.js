/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const nock = require('nock');
const cuid = require('cuid');
const fs = require('fs');
const path = require('path');
const assert = require('chai').assert;
const { describe, before, it, after } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');
const Application = require('../src/application');
const InfluxRepository = require('business/src/series/repository');
const DataMatrix = require('business/src/series/data_matrix');
const { getConfig } = require('@pryv/boiler');
const UsersRepository = require('business/src/users/repository');
const { databaseFixture } = require('test-helpers');
const {
  produceMongoConnection,
  produceInfluxConnection,
} = require('api-server/test/test-helpers');
const bluebird = require('bluebird');

let app;
let authKey;
let username1;
let user1;
let username2;
let user2;
let request;
let res;
let mongoFixtures;
let usersRepository;
let influx;
let influxRepository;
let config;
let isOpenSource = false;
let regUrl;

describe('DELETE /users/:username', async () => {
  config = await getConfig();
  regUrl = config.get('services:register:url');

  before(async function() {
    
    app = new Application();
    await app.initiate();

    require('../src/methods/auth/delete')(
      app.api,
      app.logging,
      app.storageLayer,
      app.config
    );

    require('../src/methods/auth/delete-opensource')(
      app.api,
      app.logging,
      app.storageLayer,
      app.config
    );

    request = supertest(app.expressApp);

    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.context.cleanEverything();

    influx = produceInfluxConnection(app.config);
    influxRepository = new InfluxRepository(influx);

    usersRepository = new UsersRepository(app.storageLayer.events);

    await bluebird.fromCallback((cb) =>
      app.storageLayer.eventFiles.removeAll(cb)
    );

    username1 = charlatan.Internet.userName();
    username2 = charlatan.Internet.userName();

    authKey = config.get('auth:adminAccessKey');
  });
  after(async function() {
    config.injectTestConfig({});
    await mongoFixtures.context.cleanEverything();
    await bluebird.fromCallback((cb) =>
      app.storageLayer.eventFiles.removeAll(cb)
    );
  });

  describe('depending on "user-account:delete"  config parameter', function() {
    let personalAccessToken;
    beforeEach(async function () { 
      personalAccessToken = cuid();
      user1 = await initiateUserWithData(username1);
      await user1.access({
        type: 'personal', token: personalAccessToken,
      });
      await user1.session(personalAccessToken);
    });

    it('[8UT7] Should accept when "personalToken" is active and a valid personal token is provided',async function () { 
      config.injectTestConfig({'user-account': {delete: ['personalToken']}});
      res = await request.delete(`/users/${username1}`).set('Authorization', personalAccessToken);
      assert.equal(res.status, 200);
    });

    it('[IJ5F] Should reject when "personalToken" is active and an invalid token is provided',async function () { 
      config.injectTestConfig({'user-account': {delete: ['personalToken']}});
      res = await request.delete(`/users/${username1}`).set('Authorization', 'bogus');
      assert.equal(res.status, 403); // not 404 as when option is not activated
    });

    it('[NZ6G] Should reject when only "personalToken" is active and a valid admin token is provided',async function () { 
      config.injectTestConfig({'user-account': {delete: ['personalToken']}});
      res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
      assert.equal(res.status, 403); // not 404 as when option is not activated
    });

    it('[UK8H] Should accept when "personalToken" and "adminToken" are active and a valid admin token is provided',async function () { 
      config.injectTestConfig({'user-account': {delete: ['personalToken', 'adminToken']}});
      res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
      assert.equal(res.status, 200);
    });

  });

  // ---------------- loop loop -------------- //

  isOpenSource = config.get('openSource:isActive');

  const settingsToTest = [[true, false], [false, false], [true, true]];
  const testIDs = [
    ['CM5Q', 'BQXA', '4Y76', '710F', 'GUPH', 'JNVS', 'C58U', 'IH6T'],
    ['T21Z', 'K4J1', 'TIKT', 'WMMV', '9ZTM', 'T3UK', 'O73J', 'N8TR'],
    ['TPP2', '581Z', 'Z2FH', '4IH8', '33T6', 'SQ8P', '1F2Y', '7D0J']];
  for (let i = 0; i < settingsToTest.length; i++) {
    

    // skip tests that are not in scope
    if (isOpenSource !== settingsToTest[i][1]) continue;

    describe(`dnsLess:isActive = ${settingsToTest[i][0]}, openSource:isActive = ${settingsToTest[i][1]}`, function() {
      before(async function() {
        config.injectTestConfig({
          dnsLess: {isActive: settingsToTest[i][0]}
        });
      });

      after(async function() {
        config.injectTestConfig({ });
      });

  
      describe('when given existing username', function() {
        let deletedOnRegister = false;
        let userToDelete;
        before(async function() {
          userToDelete = await initiateUserWithData(username1);
          await initiateUserWithData(username2);
          if (! settingsToTest[i][0]) { // ! isDnsLess
            nock(regUrl)
            .delete('/users/' + username1, () => {
              deletedOnRegister = true;
              return true;
            })
            .times(1)
            .reply(200, { deleted: true });
          }
          res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
        });
        it(`[${testIDs[i][0]}] should respond with 200`, function () {
          assert.equal(res.status, 200);
        });
        it(`[${testIDs[i][1]}] should delete user entries from impacted collections`, async function() {
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
        it(`[${testIDs[i][2]}] should delete user event files`, async function() {
          const pathToUserFiles = app.storageLayer.eventFiles.getAttachmentPath(userToDelete.attrs.id);
          const userFileExists = fs.existsSync(pathToUserFiles);
          assert.isFalse(userFileExists);
        });
        it(`[${testIDs[i][3]}] should not delete entries of other users`, async function() {
          const user = await usersRepository.getById(username2);
          assert.exists(user);

          const dbCollections = [
            app.storageLayer.accesses,
            app.storageLayer.events,
            app.storageLayer.streams,
          ];
          if (!isOpenSource) dbCollections.push(app.storageLayer.webhooks);

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
        it(`[${testIDs[i][4]}] should not delete other user event files`, async function() {
          const totalFilesSize = await bluebird.fromCallback((cb) =>
            app.storageLayer.eventFiles.getTotalSize({ id: username2 }, cb)
          );
          assert.notEqual(totalFilesSize, 0);
        });
        it(`[${testIDs[i][7]}] should delete on register`, async function() {
          if (settingsToTest[i][0]) this.skip(); // isDnsLess
          assert.isTrue(deletedOnRegister);
        });
      });
      describe('when given invalid authorization key', function() {
        before(async function() {
          res = await request.delete(`/users/${username1}`).set('Authorization', 'somekey');
        });
        it(`[${testIDs[i][5]}] should respond with 404`, function() {
          assert.equal(res.status, 404);
        });
      });
      describe('when given not existing username', function() {
        before(async function() {
          res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
        });
        it(`[${testIDs[i][6]}] should respond with 404`, function() {
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
  if (! isOpenSource)
    user.webhook({ id: charlatan.Lorem.word() }, charlatan.Lorem.word());

  const filePath = `test-file-${username}`;
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
  
  if (! isOpenSource) {
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
  return user;
}
