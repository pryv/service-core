/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, before, after, beforeEach */

const { databaseFixture } = require('test-helpers');

const bluebird = require('bluebird');
const lodash = require('lodash');
const chai = require('chai');
const assert = chai.assert;
const cuid = require('cuid');
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const charlatan = require('charlatan');

const { ErrorIds } = require('errors/src');

describe('accesses', () => {

  let storage, produceMongoConnection, context;
  before(() => {
    storage = require('test-helpers').dependencies.storage.user.accesses;
    ({ produceMongoConnection, context } = require('../test-helpers'));
  });

  describe('access deletions', () => {

    let userId, streamId, activeToken, deletedToken, accessToken;
    before(async () => {
      userId = cuid();
      streamId = cuid();
      activeToken = cuid();
      deletedToken = cuid();
      accessToken = cuid();
    });

    after(async () => {
      let mongoFixtures = databaseFixture(await produceMongoConnection());
      await mongoFixtures.context.cleanEverything();
    });
    describe('when given a few existing accesses', () => {

      const deletedTimestamp = timestamp.now('-1h');

      let mongoFixtures;
      before(async () => {
          mongoFixtures = databaseFixture(await produceMongoConnection());
          const user = await mongoFixtures.user(userId);
          await user.stream({ id: streamId }, () => {});

          await user.access({
            type: 'app', token: activeToken,
            name: 'active access', permissions: []
          });
          await user.access({
            type: 'app', token: deletedToken,
            name: 'deleted access', permissions: [],
            deleted: deletedTimestamp
          });

          await user.access({ token: accessToken, type: 'personal' });
          await user.session(accessToken);
      });


      let server;
      before(async () => {
        server = await context.spawn();
      });
      after(() => {
        server.stop();
      });

      describe('accesses.get', () => {
        let res, accesses, deletions;

        before(async () => {
          res = await server.request()
            .get(`/${userId}/accesses?includeDeletions=true`)
            .set('Authorization', accessToken);
          accesses = res.body.accesses;
          deletions = res.body.accessDeletions;
        });

        it('[H7ZS] access should contain tokens and apiEndpoints', () => {
          for (let access of accesses) {
            assert.exists(access.token);
            assert.exists(access.apiEndpoint);
            assert.include(access.apiEndpoint, access.token);
          }
        });


        it('[P12L] should contain deletions', () => {
          assert.isNotNull(deletions);
        });

        it('[BQ7M] contains active accesses', () => {
          assert.equal(accesses.length, 2);
          const activeAccess = accesses.find( a => a.token === activeToken );
          assert.isNotNull(activeAccess);
        });

        it('[NVCQ] contains deleted accesses as well', () => {
          assert.equal(deletions.length, 1);
          assert.equal(deletions[0].token, deletedToken);
        });

        it('[6ZQL] deleted access are in UTC (seconds) format', () => {
          const deletedAccess = deletions[0];
          assert.equal(deletedAccess.deleted, deletedTimestamp);
        });
      });

      describe('accesses.create', () => {

        describe('for a valid access', () => {
          let createdAccess;

          const access = {
            name: 'whatever',
            type: 'app',
            permissions: [
              {
                streamId: 'stream',
                level: 'read'
              }
            ]
          };

          before(async () => {
            const res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(access);
            createdAccess = res.body.access;
          });

          it('[N3Q1] should contain an access', () => {
            assert.isNotNull(createdAccess);
          });

          it('[8UOW] access should contain token and apiEndpoint', () => {
            assert.exists(createdAccess.token);
            assert.exists(createdAccess.apiEndpoint, 'Missing API endpoint');
            assert.include(createdAccess.apiEndpoint, createdAccess.token);
          });

          it('[J77Z] should contain the set values, but no "deleted" field in the API response', () => {
            assert.deepEqual(access, _.pick(createdAccess,
              ['name', 'permissions', 'type']
            ));
            assert.notExists(createdAccess.deleted);
          });

          it('[A4JP] should contain the field "deleted:null" in the database', (done) => {
            storage.findAll({ id: userId }, {}, (err, accesses) => {
              const deletedAccess = accesses.find(a => a.name === access.name);
              assert.equal(deletedAccess.deleted, null);
              done();
            });
          });
        });

        describe('for a deleted access', () => {
          let res, error;

          const deletedAccess = {
            name: 'whatever',
            type: 'app',
            permissions: [{
              streamId: 'stream',
              level: 'read'
            }],
            deleted: Date.now() / 1000
          };

          before(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(deletedAccess);
          });

          it('[1DJ6] should return an error', () => {
            error = res.body.error;
            assert.isNotNull(error);
          });

          it('[7ZPK] error should say that the deleted field is forbidden upon creation', () => {
            assert.equal(error.id, ErrorIds.InvalidParametersFormat);
          });

        });

      });

      describe('accesses.update', () => {
        let res, error, activeAccess;

        before(async () => {
          res = await server.request()
            .get(`/${userId}/accesses`)
            .set('Authorization', accessToken);
          activeAccess = res.body.accesses.find( a => a.token === activeToken );
          res = await server.request()
            .put(`/${userId}/accesses/${activeAccess.id}`)
            .set('Authorization', accessToken)
            .send({
              update: { deleted: Date.now() / 1000 }
            });
          error = res.body.error;
        });

        it('[JNJK] should return an error', () => {
          assert.isNotNull(error);
        });

        it('[OS36] error should say that the deleted field is forbidden upon update', () => {
          assert.equal(error.id, ErrorIds.Gone);
        });

      });

    });
  });

  describe('Delete app access', () => {

    let username, streamId, access,
        sharedAccess1, sharedAccess2, sharedAccess3,
        expiredSharedAccess;
    before(() => {
      username = cuid();
      streamId = charlatan.Lorem.word();
    });

    let mongoFixtures;
    before(async () => {
      mongoFixtures = databaseFixture(await produceMongoConnection());
      const user = await mongoFixtures.user(username);
      await user.stream({ id: streamId }, () => {});

      access = await user.access({
        type: 'app',
        name: charlatan.Lorem.word() + 0,
        permissions: [{
          streamId: streamId,
          level: "read",
        }]
      });
      access = access.attrs;
      sharedAccess1 = await user.access({
        type: 'shared',
        name: charlatan.Lorem.word() + 1,
        permissions: [{
          streamId: streamId,
          level: "read",
        }],
        createdBy: access.id,
      });
      sharedAccess1 = sharedAccess1.attrs;
      sharedAccess2 = await user.access({
        type: 'shared',
        name: charlatan.Lorem.word() + 2,
        permissions: [{
          streamId: streamId,
          level: "read",
        }],
        createdBy: access.id,
      });
      sharedAccess2 = sharedAccess2.attrs;
      // some unrelated access that shouldn't be changed
      sharedAccess3 = await user.access({
        type: 'shared',
        name: charlatan.Lorem.word() + 3,
        permissions: [{
          streamId: streamId,
          level: "read",
        }],
      });
      sharedAccess3 = sharedAccess3.attrs;
      expiredSharedAccess = await user.access({
        type: 'shared',
        expires: timestamp.now('-1d'),
        name: charlatan.Lorem.word() + 4,
        permissions: [{
          streamId: streamId,
          level: "read",
        }],
      });
      expiredSharedAccess = expiredSharedAccess.attrs;
    });
    after(async () => {
      await mongoFixtures.clean();
    });

    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop();
    });

    describe('when deleting an app access that created shared accesses', () => {
      let res;
      before(async () => {
        res = await server.request()
          .del(`/${username}/accesses/${access.id}`)
          .set('Authorization', access.token)
      });

      it('[WE2O] should return the accessDeletion and relatedDeletions', () => {
        const accessDeletion = res.body.accessDeletion;
        const relatedDeletions = res.body.relatedDeletions;
        assert.exists(accessDeletion);
        assert.exists(relatedDeletions);
        assert.equal(accessDeletion.id, access.id);
        let found1 = false;
        let found2 = false;
        let found3 = false;
        assert.equal(relatedDeletions.length, 2);
        relatedDeletions.forEach(a => {
          if (a.id === sharedAccess1.id) found1 = true;
          if (a.id === sharedAccess2.id) found2 = true;
          if (a.id === expiredSharedAccess.id) found3 = true;
        });
        assert.isTrue(found1);
        assert.isTrue(found2);
        assert.isFalse(found3);
      });
      it('[IVWP] should delete it and the accesses it created, not touching the expired ones', async () => {
        await bluebird.fromCallback(callback => {
          storage.findAll({ id: username }, {}, (err, accesses) => {
            const deletedAccess = accesses.find(a => a.id === access.id);
            const deletedShared1 = accesses.find(a => a.id === sharedAccess1.id);
            const deletedShared2 = accesses.find(a => a.id === sharedAccess2.id);
            const notDeletedAccess3 = accesses.find(a => a.id === sharedAccess3.id);
            const notDeletedAccess4 = accesses.find(a => a.id === expiredSharedAccess.id);
            assert.exists(deletedAccess.deleted);
            assert.exists(deletedShared1.deleted);
            assert.exists(deletedShared2.deleted);
            assert.notExists(notDeletedAccess3.deleted);
            assert.notExists(notDeletedAccess4.deleted);
            callback();
          });
        });
      });
    });

  });

  describe('access expiry', () => {
    // Uses dynamic fixtures:
    let mongoFixtures;
    // Set up a few ids that we'll use for testing. NOTE that these ids will
    // change on every test run.
    let userId, streamId, accessToken, expiredToken, validId;
    let hasExpiryId, hasExpiryToken;
    before(async () => {
      userId = cuid();
      streamId = cuid();
      accessToken = cuid();
      expiredToken = cuid();
      validId = cuid();
      hasExpiryId = cuid();
      hasExpiryToken = cuid();
    });

    describe('when given a few existing accesses', () => {

      let mongoFixtures;
      before(async () => {
        mongoFixtures = databaseFixture(await produceMongoConnection());
        const user = await mongoFixtures.user(userId);
        await user.stream({id: streamId}, () => { });

        // A token that expired one day ago
        await user.access({
          type: 'app', token: expiredToken,
          expires: timestamp.now('-1d'),
          name: 'expired access',
          permissions: [],
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
        await user.access({
          id: validId,
          type: 'app', token: cuid(),
          name: 'doesnt expire',
        });

        await user.access({token: accessToken, type: 'personal'});
        await user.session(accessToken);
      });

      let server;
      before(async () => {
        server = await context.spawn();
      });
      after(() => {
        server.stop();
      });

      const isExpired = e => e.expires != null && timestamp.now() > e.expires;

      describe('accesses.get', () => {
        describe('vanilla version', () => {
          let res;
          let accesses;

          beforeEach(async () => {
            res = await server.request()
              .get(`/${userId}/accesses`)
              .set('Authorization', accessToken);

            accesses = res.body.accesses;
          });

          it('[489J] succeeds', () => {
            assert.isNotNull(accesses);
          });
          it('[7NPE] contains only active accesses', () => {
            for (const a of accesses)
              assert.isFalse(isExpired(a),
                `Access '${a.name}' is expired`);
          });
        });

        describe('when given the includeExpired=true parameter', () => {
          let res;
          let accesses;

          beforeEach(async () => {
            res = await server.request()
              .get(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .query('includeExpired=true');

            accesses = res.body.accesses;
          });

          it('[PIGE] succeeds', () => {
            assert.isNotNull(accesses);
          });
          it('[DZHL] includes expired accesses', () => {
            assert.isAbove(lodash.filter(accesses, isExpired).length, 0);
          });
        });
      });
      describe('accesses.create', () => {
        describe('when called with expireAfter>0', () => {
          const attrs = {
            name: 'For colleagues (1)',
            type: 'app',
            expireAfter: 3600, // in seconds
            permissions: [
              {
                streamId: 'work',
                level: 'read',
              },
            ],
          };

          let res, access;
          beforeEach(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(attrs);

            access = res.body.access;

            if (! res.ok && res.body.error != null) {
              console.error(res.body.error);  // eslint-disable-line no-console
              // console.dir(res.body.error.data[0].inner);
            }
          });

          it('[3ONA] creates an access with set expiry timestamp', () => {
            assert.strictEqual(res.status, 201);
            assert.isAbove(access.expires, timestamp.now());
          });
        });
        describe('when called with expireAfter=0', () => {
          const attrs = {
            name: 'For colleagues (2)',
            expireAfter: 0, // in seconds
            type: 'app',
            permissions: [
              {
                streamId: 'work',
                level: 'read',
              },
            ],
          };

          let res, access;
          beforeEach(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(attrs);

            access = res.body.access;

            if (! res.ok && res.body.error != null) {
              console.error(res.body.error);  // eslint-disable-line no-console
              // console.dir(res.body.error.data[0].inner);
            }
          });

          it('[8B65] creates an expired access', () => {
            assert.strictEqual(res.status, 201);
            assert.isAbove(timestamp.now(), access.expires);
          });
        });
        describe('when called with expireAfter<0', () => {
          const attrs = {
            name: 'For colleagues (3)',
            expireAfter: -100, // in seconds
            type: 'app',
            permissions: [
              {
                streamId: 'work',
                level: 'read',
              },
            ],
          };

          let res;
          beforeEach(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(attrs);
          });

          it('[JHWH] fails', () => {
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error.message, 'expireAfter cannot be negative.');
          });
        });
      });

      describe('accesses.checkApp', () => {
        describe('when the matching access is not expired', () => {
          let res;
          beforeEach(async () => {
            res = await server.request()
              .post(`/${userId}/accesses/check-app`)
              .set('Authorization', accessToken)
              .send({
                requestingAppId: 'valid access',
                requestedPermissions: [
                  {
                    'streamId': 'diary',
                    'defaultName': 'Diary',
                    'level': 'read'
                  }
                ]
              });
          });

          it('[B66B] returns the matching access', () => {
            assert.isTrue(res.ok);
            assert.strictEqual(res.body.matchingAccess.token, hasExpiryToken);
          });
        });
        describe('when the matching access is expired', () => {
          let res;
          beforeEach(async () => {
            res = await server.request()
              .post(`/${userId}/accesses/check-app`)
              .set('Authorization', accessToken)
              .send({
                requestingAppId: 'expired access',
                requestedPermissions: []
              });

            // NOTE It is important that the reason why we have a mismatch here is
            // that the access is expired, not that we're asking for different
            // permissions.
          });

          it('[DLHJ] returns no match', () => {
            assert.isUndefined(res.body.matchingAccess);

            const mismatching = res.body.mismatchingAccess;
            assert.strictEqual(mismatching.token, expiredToken);
          });
        });
      });

      describe('other API accesses', () => {

        function apiAccess(token) {
          return server.request()
            .get(`/${userId}/events`)
            .set('Authorization', token);
        }

        describe('using an expired access', () => {
          let res;
          beforeEach(async () => {
            res = await apiAccess(expiredToken);
          });

          it('[AJG5] fails', () => {
            assert.strictEqual(res.status, 403);
          });
          it('[KGT4] returns a proper error message', () => {
            const error = res.body.error;

            assert.isNotNull(error);
            assert.strictEqual(error.id, 'forbidden');
            assert.strictEqual(error.message, 'Access has expired.');
          });
        });
        describe('using a valid access', () => {
          let res;
          beforeEach(async () => {
            res = await apiAccess(accessToken);
          });

          it('[CBRF] succeeds', () => {
            assert.strictEqual(res.status, 200);
          });
        });
      });
    });
  });

  describe('access client data', () => {
    let mongoFixtures;
    function sampleAccess(name, clientData) {
      return {
        id: cuid(),
        type: 'app',
        name: name,
        permissions: [],
        clientData: clientData,
      };
    }

    // Set up a few ids that we'll use for testing. NOTE that these ids will
    // change on every test run.
    let userId, streamId, accessToken, complexClientData, existingAccess;
    let toBeUpdateAccess1, toBeUpdateAccess2, toBeUpdateAccess3, emptyClientDataAccess;
    let fixtureAccesses;
    before(async () => {
      userId = cuid();
      streamId = cuid();
      accessToken = cuid();
      complexClientData = {
        aString: 'a random string',
        aNumber: 42,
        anArray: ['what', 'a', 'big', 'array', 'you', 'got'],
        anObject: {child: 'I feel empty', leaf: 42}
      };
      existingAccess = sampleAccess('Access with complex clientData', complexClientData);
      toBeUpdateAccess1 = sampleAccess('Access to be updated 1', complexClientData);
      toBeUpdateAccess2 = sampleAccess('Access to be updated 2', complexClientData);
      toBeUpdateAccess3 = sampleAccess('Access to be updated 3', complexClientData);
      emptyClientDataAccess = sampleAccess('Access with empty clientData', null);
      fixtureAccesses = [existingAccess, toBeUpdateAccess1, toBeUpdateAccess2, toBeUpdateAccess3, emptyClientDataAccess];
    });

    describe('when given a few existing accesses', () => {

      let mongoFixtures;
      before(async () => {
        mongoFixtures = databaseFixture(await produceMongoConnection());
        const user = await mongoFixtures.user(userId);
        await user.stream({id: streamId}, () => { });
        await user.access({token: accessToken, type: 'personal'});
        await user.access(existingAccess);
        await user.access(toBeUpdateAccess1);
        await user.access(toBeUpdateAccess2);
        await user.access(toBeUpdateAccess3);
        await user.access(emptyClientDataAccess);
        await user.session(accessToken);
      });

      let server;
      before(async () => {
        server = await context.spawn();
      });
      after(() => {
        server.stop();
      });

      describe('accesses.get', () => {
        let res, accesses;
        before(async () => {
          res = await server.request()
            .get(`/${userId}/accesses`)
            .set('Authorization', accessToken);

          accesses = res.body.accesses;
        });

        it('[KML2] succeeds', () => {
          assert.exists(accesses);
        });

        it('[NY85] contains existing accesses with clientData', () => {
          for (const a of accesses) {
            const fixtureAccess =
              fixtureAccesses.find(f => {return f.id === a.id;});
            if (fixtureAccess != null)
              assert.deepEqual(a.clientData, fixtureAccess.clientData);
          }
        });
      });

      describe('accesses.create', () => {

        function sampleAccess (name, clientData) {
          return {
            name: name,
            type: 'app',
            permissions: [
              {
                streamId: 'work',
                level: 'read',
              },
            ],
            clientData: clientData,
          };
        }

        function checkResultingAccess (res) {
          const access = res.body.access;
          assert.isTrue(res.ok);
          assert.notExists(res.body.error);
          assert.exists(access);
          return access;
        }

        describe('when called with clientData={}', () => {
          let res, access;
          before(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(sampleAccess('With empty clientData', {}));

            access = checkResultingAccess(res);
          });

          it('[OMUO] creates an access with empty clientData', () => {
            assert.strictEqual(res.status, 201);
            assert.deepEqual(access.clientData, {});
          });
        });

        describe('when called with clientData=null', () => {
          let res;
          before(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(sampleAccess('With null clientData', null));
          });

          it('[E5C1] throws a schema error', () => {
            assert.isFalse(res.ok);
            assert.exists(res.body.error);
          });
        });

        describe('when called with complex clientData', () => {
          let res, access;
          before(async () => {
            res = await server.request()
              .post(`/${userId}/accesses`)
              .set('Authorization', accessToken)
              .send(sampleAccess('With complex clientData', complexClientData));

            access = checkResultingAccess(res);
          });

          it('[JYD4] creates an access with complex clientData', () => {
            assert.strictEqual(res.status, 201);
            assert.deepEqual(access.clientData, complexClientData);
          });
        });
      });

      describe('accesses.checkApp', () => {

        async function checkAppRequest(req) {
          const res = await server.request()
            .post(`/${userId}/accesses/check-app`)
            .set('Authorization', accessToken)
            .send(req);

          assert.isTrue(res.ok);
          assert.exists(res.body);
          assert.notExists(res.body.error);
          return res.body;
        }

        describe('when the provided clientData matches the existing clientData', () => {
          let body;
          before(async () => {
            body = await checkAppRequest({
              requestingAppId: existingAccess.name,
              requestedPermissions: existingAccess.permissions,
              clientData: existingAccess.clientData,
            });
          });

          it('[U1AM] returns the matching access', () => {
            assert.exists(body.matchingAccess);
            assert.strictEqual(body.matchingAccess.id, existingAccess.id);
          });
        });

        describe('when the provided clientData does not match the existing clientData', () => {
          let body;
          before(async () => {
            body = await checkAppRequest({
              requestingAppId: existingAccess.name,
              requestedPermissions: existingAccess.permissions,
              clientData: {},
            });
          });

          it('[2EER] returns no match', () => {
            assert.exists(body.mismatchingAccess);
            assert.strictEqual(body.mismatchingAccess.id, existingAccess.id);
          });
        });

        describe('when no clientData is provided but existing access has one', () => {
          let body;
          before(async () => {
            body = await checkAppRequest({
              requestingAppId: existingAccess.name,
              requestedPermissions: existingAccess.permissions,
            });
          });

          it('[DHZQ] returns no match', () => {
            assert.exists(body.mismatchingAccess);
            assert.strictEqual(body.mismatchingAccess.id, existingAccess.id);
          });
        });
      });
    });
  });

  describe('access-info', () => {

    let mongoFixtures, userId,
        token;

    before(() => {
      token = cuid();
      userId = cuid();
    })

    before(async () => {
      mongoFixtures = databaseFixture(await produceMongoConnection());
      const user = await mongoFixtures.user(userId);
      await user.access({
        type: 'app', token: token,
        name: charlatan.Lorem.word(), permissions: [{
          streamId: charlatan.Lorem.word(),
          level: 'read',
        }],
      });
    });

    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop();
    });

    function path() {
      return `/${userId}/access-info`;
    }

    it('[PH0K] should return the username', async () => {
      const res = await server.request()
        .get(path())
        .set('Authorization', token);
      const body = res.body;
      assert.exists(body.user);
      assert.exists(body.user.username)
      assert.equal(body.user.username, userId);
    });

  });
});
