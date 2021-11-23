/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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
const { getApplication } = require('api-server/src/application');
const InfluxRepository = require('business/src/series/repository');
const DataMatrix = require('business/src/series/data_matrix');
const { getConfig } = require('@pryv/boiler');
const { getUsersRepository } = require('business/src/users');
const { databaseFixture } = require('test-helpers');
const {
  produceMongoConnection,
  produceInfluxConnection,
} = require('api-server/test/test-helpers');

const { pubsub } = require('messages');
const bluebird = require('bluebird');

const cache = require('cache');

let app;
let authKey;
let username1; // fixtures reuse the username for userId
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

describe('DELETE /users/:username', () => {

  before(async function() {
    config = await getConfig();
    regUrl = config.get('services:register:url');
    isOpenSource = config.get('openSource:isActive');
    app = getApplication();
    await app.initiate();

    await require('../src/methods/auth/delete')(app.api);
    let axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args),
    };
    pubsub.setTestNotifier(axonSocket);
    await require('api-server/src/methods/events')(app.api);

    request = supertest(app.expressApp);

    mongoFixtures = databaseFixture(await produceMongoConnection());
    await mongoFixtures.context.cleanEverything();

    influx = produceInfluxConnection(app.config);
    influxRepository = new InfluxRepository(influx);

    usersRepository = await getUsersRepository(); 

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

  
 
  // [isDnsLess, isOpenSource]
  const settingsToTest = [[true, false], [false, false], [true, true]];
  const testIDs = [
    ['CM5Q', 'BQXA', '4Y76', '710F', 'GUPH', 'JNVS', 'C58U', 'IH6T', '75IW', 'MPXH', '635G'],
    ['T21Z', 'K4J1', 'TIKT', 'WMMV', '9ZTM', 'T3UK', 'O73J', 'N8TR', '7WMG', 'UWYY', 'U004'],
    ['TPP2', '581Z', 'Z2FH', '4IH8', '33T6', 'SQ8P', '1F2Y', '7D0J', 'YD0B', 'L2Q1', 'CQ50']];
  for (let i = 0; i < settingsToTest.length; i++) {
    
    // skip tests that are not in scope
    
    describe(`dnsLess:isActive = ${settingsToTest[i][0]}, openSource:isActive = ${settingsToTest[i][1]}`, function() {
      before(async function() {
        if (isOpenSource !== settingsToTest[i][1]) this.skip();
        config.injectTestConfig({
          dnsLess: {isActive: settingsToTest[i][0]}
        });
      });

      after(async function() {
        config.injectTestConfig({ });
      });

  
      describe('[D7HZ] when given existing username', function() {
        let deletedOnRegister = false;
        let userToDelete;
        before(async function() {

          userToDelete = await initiateUserWithData(username1);
          await initiateUserWithData(username2);
          if (! settingsToTest[i][0]) { // ! isDnsLess
            nock(regUrl)
            .delete('/users/' + username1 + '?onlyReg=true', () => {
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
          assert.equal(res.body.userDeletion.username, username1);
        });
        it(`[${testIDs[i][1]}] should delete user entries from impacted collections`, async function() {
          const user = await usersRepository.getUserById(username1);
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
        it(`[${testIDs[i][8]}] should delete HF data`, async function() {
          if (isOpenSource) this.skip();
          const databases = await influx.getDatabases();
          const isFound = databases.indexOf(`user.${userToDelete.attrs.username}`) >= 0;
          assert.isFalse(isFound);
        });
        it(`[${testIDs[i][9]}] should delete user audit events`, async function() {
          const pathToUserAuditData = require('business').users.UserLocalDirectory.pathForuserId(userToDelete.attrs.id);
          const userFileExists = fs.existsSync(pathToUserAuditData);
          assert.isFalse(userFileExists);
        });
        it(`[${testIDs[i][10]}] should delete user from the cache`, async function() {
          const usersExists = cache.get(cache.NS.USERID_BY_USERNAME, userToDelete.attrs.id);
          assert.isUndefined(usersExists);
        })
        it(`[${testIDs[i][3]}] should not delete entries of other users`, async function() {
          const user = await usersRepository.getUserById(username2);
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
  const token = cuid();
  await user.access({ id: charlatan.Lorem.word(), token, type: 'app', permissions: [{ streamId: stream.attrs.id, level: 'read' }] });
  await user.session(charlatan.Lorem.word());
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
      `user.${username}`,
      `event.${cuid()}`
    );
    const data = new DataMatrix(
      ['deltaTime', 'value'],
      [
        [0, 10],
        [1, 20],
      ]
    );
    usersSeries.append(data);
    // generate audit trace
    await request.get(`/${username}/events`)
      .set('Authorization', token);
  }
  return user;
}
