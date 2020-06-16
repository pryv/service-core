/* global describe, before, beforeEach, it */

require('./test-helpers');
const helpers = require('./helpers');

const server = helpers.dependencies.instanceManager;
const async = require('async');

const { validation } = helpers;
const methodsSchema = require('../src/schema/profileMethods');

const storage = helpers.dependencies.storage.user.profile;
const testData = helpers.data;
const _ = require('lodash');

describe('profile (personal)', () => {
  const user = testData.users[0];
  const basePath = `/${user.username}/profile`;
  let request = null; // must be set after server instance started
  const publicProfile = testData.profile[0];
  const privateProfile = testData.profile[1];

  before((done) => {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      },
    ], done);
  });

  describe('GET', () => {
    before(testData.resetProfile);

    it('[J61R] /public must return publicly shared key-value profile info',
      testGet.bind(null, publicProfile));

    it('[HIMS] /private must return private key-value profile info',
      testGet.bind(null, privateProfile));

    function testGet(profile, done) {
      request.get(`${basePath}/${profile.id}`).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { profile: profile.data },
        }, done);
      });
    }

    it('[36B1] must return an appropriate error for other paths', (done) => {
      request.get(`${basePath}/unknown-profile`).end((res) => {
        res.statusCode.should.eql(404);
        done();
      });
    });

    it('[FUJA] "private" must be forbidden to non-personal accesses', (done) => {
      request.get(`${basePath}/private`, testData.accesses[4].token).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });
  });

  describe('PUT', () => {
    beforeEach(testData.resetProfile);

    it('[M28R] /public must add/update/remove the specified keys without touching the others',
      testPut.bind(null, publicProfile));

    it('[WU9C] /private must add/update/remove the specified keys without touching the others',
      testPut.bind(null, privateProfile));

    it('[2AS6] must create the profile if not existing', (done) => {
      async.series([
        storage.removeAll.bind(storage, user),
        testPut.bind(null, { id: 'public', data: {} }),
      ], done);
    });

    function testPut(original, done) {
      const data = {
        newKey: 'New Value', // add
        keyOne: 'No One', // update
        keyTwo: null, // delete
      };
      request.put(`${basePath}/${original.id}`).send(data).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result,
        });

        const expectedData = _.extend(_.cloneDeep(original.data), data);
        delete expectedData.keyTwo;
        res.body.profile.should.eql(expectedData);

        done();
      });
    }

    it('[Q99E] must return an appropriate error for other paths', (done) => {
      request.put(`${basePath}/unknown-profile`).send({ an: 'update' }).end((res) => {
        res.statusCode.should.eql(404);
        done();
      });
    });

    it('[T565] must be forbidden to non-personal accesses', (done) => {
      request.put(`${basePath}/public`, testData.accesses[4].token).send({ an: 'update' })
        .end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });
  });
});
