/* global describe, before, beforeEach, it */

require('./test-helpers');
const helpers = require('./helpers');
const { ErrorIds } = require('components/errors');

const server = helpers.dependencies.instanceManager;
const async = require('async');

const { validation } = helpers;
const methodsSchema = require('../src/schema/profileMethods');

const testData = helpers.data;
const _ = require('lodash');

describe('profile (app)', () => {
  const user = testData.users[0];
  const basePath = `/${user.username}/profile`;
  let request = null; // must be set after server instance started
  const appAccess = testData.accesses[4];
  const appProfile = testData.profile[2];
  const sharedAccess = testData.accesses[1];

  before((done) => {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); },
    ], done);
  });

  describe('GET /public', () => {
    before(testData.resetProfile);

    const path = `${basePath}/public`;

    it('[FWG1] must return publicly shared key-value profile info', (done) => {
      request.get(path, appAccess.token).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { profile: testData.profile[0].data },
        }, done);
      });
    });
  });

  describe('GET /app', () => {
    before(testData.resetProfile);

    const path = `${basePath}/app`;

    it('[13DL] must return key-value settings for the current app', (done) => {
      request.get(path, appAccess.token).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { profile: appProfile.data },
        }, done);
      });
    });

    it('[J37U] must refuse requests with a shared access token', (done) => {
      request.get(path, sharedAccess.token).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
        }, done);
      });
    });

    it('[GYBN] must refuse requests with a personal access token', (done) => {
      const personalRequest = helpers.request(server.url);
      async.series([
        personalRequest.login.bind(personalRequest, user),
        function (stepDone) {
          personalRequest.get(path).end((res) => {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation,
            }, stepDone);
          });
        },
      ], done);
    });
  });

  describe('PUT /app', () => {
    beforeEach(testData.resetProfile);

    const path = `${basePath}/app`;

    it('[1QFB] must add/update/remove the specified keys without touching the others', (done) => {
      const data = {
        newKey: 'New Value', // add
        keyOne: 'No One', // update
        keyTwo: null, // delete
      };
      request.put(path, appAccess.token).send(data).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result,
        });

        const expectedData = _.extend(_.cloneDeep(appProfile.data), data);
        delete expectedData.keyTwo;
        res.body.profile.should.eql(expectedData);

        done();
      });
    });

    it('[0H9A] must refuse requests with a shared access token', (done) => {
      request.put(path, sharedAccess.token).send({ any: 'thing' }).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidOperation,
        }, done);
      });
    });

    it('[JC5F] must refuse requests with a personal access token', (done) => {
      const personalRequest = helpers.request(server.url);
      async.series([
        personalRequest.login.bind(personalRequest, user),
        function (stepDone) {
          personalRequest.put(path).send({ any: 'thing' }).end((res) => {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidOperation,
            }, stepDone);
          });
        },
      ], done);
    });
  });
});
