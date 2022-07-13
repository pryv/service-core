/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
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
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { pubsub } = require('messages');
const bluebird = require('bluebird');
const { getMall } = require('mall');

const cache = require('cache');
const { MESSAGES } = require('cache/src/synchro');

let app;
let authKey;
let username1; // fixtures reuse the username for userId
let user1;
let username2;
let request;
let res;
let mongoFixtures;
let usersRepository;
let influx;
let influxRepository;
let config;
let isOpenSource = false;
let regUrl;
let mall;

describe('[PGTD] DELETE /users/:username', () => {

  before(async function() {
    config = await getConfig();
    regUrl = config.get('services:register:url');
    isOpenSource = config.get('openSource:isActive');
    app = getApplication();
    await app.initiate();
    await require('api-server/src/methods/auth/delete')(app.api);
    let axonMsgs = [];
    const axonSocket = {
      emit: (...args) => axonMsgs.push(args),
    };
    // needed even if not used
    pubsub.setTestNotifier(axonSocket);
    await require('api-server/src/methods/events')(app.api);
    await require('api-server/src/methods/streams')(app.api);
    await require('api-server/src/methods/auth/login')(app.api);
    await require('api-server/src/methods/utility')(app.api);
    await require('api-server/src/methods/auth/register')(app.api);

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

    mall = await getMall();
  });

  after(async function() {
    config.injectTestConfig({});
    await mongoFixtures.context.cleanEverything();
    await bluebird.fromCallback((cb) =>
      app.storageLayer.eventFiles.removeAll(cb)
    );
  });

  describe('[USAD] depending on "user-account:delete"  config parameter', function() {
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
  const settingsToTest = [
    [true, false],
    [false, false],
    [true, true]
  ];
  const testIDs = [
    ['CM5Q', 'BQXA', '4Y76', '710F', 'GUPH', 'JNVS', 'C58U', 'IH6T', '75IW', 'MPXH', '635G'],
    ['T21Z', 'K4J1', 'TIKT', 'WMMV', '9ZTM', 'T3UK', 'O73J', 'N8TR', '7WMG', 'UWYY', 'U004'],
    ['TPP2', '581Z', 'Z2FH', '4IH8', '33T6', 'SQ8P', '1F2Y', '7D0J', 'YD0B', 'L2Q1', 'CQ50']
  ];
  [0,1,2].forEach(function (i) {
    describe(`[DOA${i}] dnsLess:isActive = ${settingsToTest[i][0]}, openSource:isActive = ${settingsToTest[i][1]}`, function() {
      before(async function() {
       
        config.injectTestConfig({
          dnsLess: {isActive: settingsToTest[i][0]},
          isOpenSource: {isActive: settingsToTest[i][1]},
          testsSkipForwardToRegister: settingsToTest[i][0],
        });
        if (isOpenSource && settingsToTest[i][1]) this.skip();
      });

      after(async function() {
        config.injectTestConfig({ });
      });

      describe(`[D7H${i}] when given existing username`, function() {
        let deletedOnRegister = false;
        let userToDelete;
        let natsDelivered = [];
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
          pubsub.setTestNatsDeliverHook(function(scopeName, eventName, payload) {
            natsDelivered.push({scopeName, eventName, payload});
          });
          res = await request.delete(`/users/${username1}`).set('Authorization', authKey);
        });
        after(async function() {
          pubsub.setTestNatsDeliverHook(null);
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

          // check events from mall
          const events = await mall.events.get(username1,{});
          assert.empty(events);

          // check streams from mall
          let streams = await mall.streams.get(username1,{storeId: 'local', includeTrashed: true, hideStoreRoots: true});
          streams = streams.filter(s => ! SystemStreamsSerializer.isSystemStreamId(s.id));

          assert.empty(streams);

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
          const usersExists = cache.getUserId(userToDelete.attrs.id);
          assert.isUndefined(usersExists);
          assert.equal(natsDelivered.length, 1);
          assert.equal(natsDelivered[0].scopeName, 'cache.' + MESSAGES.UNSET_USER);
          assert.equal(natsDelivered[0].eventName, MESSAGES.UNSET_USER);
          assert.equal(natsDelivered[0].payload.username, userToDelete.attrs.id);
        });
        it(`[${testIDs[i][3]}] should not delete entries of other users`, async function() {
          const user = await usersRepository.getUserById(username2);
          assert.exists(user);

          const dbCollections = [
            app.storageLayer.accesses,
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

          // check events from mall
          const events = await mall.events.get(username2,{});
          assert.notEmpty(events);

          // check streams from mall
          let streams = await mall.streams.get(username2,{storeId: 'local', includeTrashed: true, hideStoreRoots: true});
          streams = streams.filter(s => ! SystemStreamsSerializer.isSystemStreamId(s.id));
          assert.notEmpty(streams);

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
  });

  describe('User - Create - Delete - Create - Login', function () {
    const usernamex = charlatan.Internet.userName().replace('_', '-') + 'x';

    it('[JBZM] should be able to recreate this user, and login', async function() {
      nock(regUrl).post('/users/validate', () => {return true;}).times(2)
        .reply(200, { errors: [] });

      nock(regUrl).post('/users', () => {return true;}).times(2)
        .reply(201, {username: usernamex});

      nock(regUrl).put('/users', () => {return true;}).times(2)
        .reply(200, {ok: true});

      await createUser();
      await deleteUser();
      await createUser();

      res = await request.post('/' + usernamex + '/auth/login')
        .set('Origin', 'http://test.pryv.local')
        .send({
          appId: 'pryv-test',
          username: usernamex,
          password: 'blupblipblop'
        });
      assert.equal(res.status, 200, 'should login');
      assert.isString(res.body.apiEndpoint, 'should receive an api Endpoint');
      assert.isString(res.body.token, 'should receive a token');

      await deleteUser();

      async function createUser() {
        res = await request.post('/users')
          .send({
            appId: 'pryv-test',
            username: usernamex,
            password: 'blupblipblop',
            email: usernamex + '@example.com',
            insurancenumber: '123456789',
          });

        assert.equal(res.status, 201, 'should create a new user');
        assert.isString(res.body.apiEndpoint, 'should receive an api Endpoint');
        const token = res.body.apiEndpoint.split('//')[1].split('@')[0];

        res = await request.post(`/${usernamex}/`).set('Authorization', token).send(
          [{
            method: 'streams.create', params: {id: 'diary', name: 'Journal'}
          },
          {
            method: 'events.create', params: {streamId: 'diary', type: 'mass/kg', content: 70}
          }]
        );
        assert.equal(res.status, 200, 'should create a stream and an event');
        assert.isArray(res.body.results, 'should receive an array of results');
        assert.isObject(res.body.results[0].stream, 'should receive an stream');
        assert.isObject(res.body.results[1].event, 'should receive an event');
      }

      async function deleteUser() {
        res = await request.delete(`/users/${usernamex}`).set('Authorization', authKey);
        assert.equal(res.status, 200, 'should delete the user');
        assert.equal(res.body.userDeletion?.username, usernamex, 'should receive the deleted username');
      }
    });
  });

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
  await app.storageLayer.eventFiles.saveAttachedFileFromTemp(path.resolve(filePath),
    username, charlatan.Lorem.word());

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
