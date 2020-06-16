/* global describe, before, beforeEach, it */

require('./test-helpers');
const helpers = require('./helpers');
const { ErrorIds } = require('components/errors');

const server = helpers.dependencies.instanceManager;
const async = require('async');

const { validation } = helpers;
const should = require('should');
// explicit require to benefit from static functions
const storage = helpers.dependencies.storage.user.followedSlices;
const testData = helpers.data;
const _ = require('lodash');
const methodsSchema = require('../src/schema/followedSlicesMethods');

describe('followed slices', () => {
  const user = testData.users[0];
  const basePath = `/${user.username}/followed-slices`;
  let request = null; // must be set after server instance started

  function path(id) {
    return `${basePath}/${id}`;
  }

  // to verify data change notifications
  let followedSlicesNotifCount;
  server.on('followed-slices-changed', () => { followedSlicesNotifCount++; });

  before((done) => {
    async.series([
      testData.resetUsers,
      helpers.dependencies.storage.user.accesses
        .removeAll.bind(helpers.dependencies.storage.user.accesses, user),
      helpers.dependencies.storage.user.accesses
        .insertMany.bind(helpers.dependencies.storage.user.accesses, user,
          [testData.accesses[4]]),
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      },
    ], done);
  });

  describe('GET /', () => {
    before(resetFollowedSlices);

    it('[TNKS] must return all followed slices (ordered by user name, then access token)',
      (done) => {
        request.get(basePath).end((res) => {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.get.result,
            body: { followedSlices: _.sortBy(testData.followedSlices, 'name') },
          }, done);
        });
      });

    it('[U9M4] must be forbidden to non-personal accesses', (done) => {
      request.get(basePath, testData.accesses[4].token).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });
  });

  describe('POST /', () => {
    beforeEach(resetFollowedSlices);

    it('[HVYA] must create a new followed slice with the sent data, returning it', (done) => {
      const data = {
        name: 'Some followed slice',
        url: 'https://mirza.pryv.io/',
        accessToken: 'some-token',
      };
      let originalCount;
      let createdSlice;

      async.series([
        function countInitial(stepDone) {
          storage.countAll(user, (err, count) => {
            originalCount = count;
            stepDone();
          });
        },
        function addNew(stepDone) {
          request.post(basePath).send(data).end((res) => {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result,
            });
            createdSlice = res.body.followedSlice;
            followedSlicesNotifCount.should.eql(1, 'followed slices notifications');
            stepDone();
          });
        },
        function verifyData(stepDone) {
          storage.findAll(user, null, (err, followedSlices) => {
            followedSlices.length.should.eql(originalCount + 1, 'followed slices');

            const expected = _.clone(data);
            expected.id = createdSlice.id;
            const actual = _.find(followedSlices, (slice) => slice.id === createdSlice.id);
            validation.checkStoredItem(actual, 'followedSlice');
            actual.should.eql(expected);

            stepDone();
          });
        },
      ],
      done);
    });

    it('[BULL] must return a correct error if the sent data is badly formatted', (done) => {
      request.post(basePath).send({ badProperty: 'bad value' }).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[GPZK] must return a correct error if the same followed slice (url and token) already exists',
      (done) => {
        const data = {
          name: 'New name',
          url: testData.followedSlices[0].url,
          accessToken: testData.followedSlices[0].accessToken,
        };
        request.post(basePath).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.ItemAlreadyExists,
            data: { url: data.url, accessToken: data.accessToken },
          }, done);
        });
      });

    it('[RYNB] must return a correct error if a followed slice with the same name already exists',
      (done) => {
        const data = {
          name: testData.followedSlices[0].name,
          url: 'https://hippolyte.pryv.io/',
          accessToken: 'some-token',
        };
        request.post(basePath).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.ItemAlreadyExists,
            data: { name: data.name },
          }, done);
        });
      });
  });

  describe('PUT /<id>', () => {
    beforeEach(resetFollowedSlices);

    it('[LM08] must modify the followed slice with the sent data', (done) => {
      const original = testData.followedSlices[0];
      const newSliceData = {
        name: 'Updated Slice 0',
      };

      request.put(path(original.id)).send(newSliceData).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result,
        });

        const expected = _.clone(newSliceData);
        _.defaults(expected, original);
        res.body.followedSlice.should.eql(expected);

        followedSlicesNotifCount.should.eql(1, 'followed slices notifications');
        done();
      });
    });

    it('[QFGH] must return a correct error if the followed slice does not exist', (done) => {
      request.put(path('unknown-id')).send({ name: '?' }).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });

    it('[RUQE] must return a correct error if the sent data is badly formatted', (done) => {
      request.put(path(testData.followedSlices[1].id)).send({ badProperty: 'bad value' })
        .end((res) => {
          validation.checkErrorInvalidParams(res, done);
        });
    });

    it('[T256] must return a correct error if a followed slice with the same name already exists',
      (done) => {
        const update = { name: testData.followedSlices[0].name };
        request.put(path(testData.followedSlices[1].id)).send(update).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.ItemAlreadyExists,
            data: { name: update.name },
          }, done);
        });
      });
  });

  describe('DELETE /<id>', () => {
    beforeEach(resetFollowedSlices);

    it('[U7LY] must delete the followed slice', (done) => {
      const deletedId = testData.followedSlices[2].id;
      async.series([
        function deleteSlice(stepDone) {
          request.del(path(deletedId)).end((res) => {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.del.result,
            });
            followedSlicesNotifCount.should.eql(1, 'followed slices notifications');
            stepDone();
          });
        },
        function verifyData(stepDone) {
          storage.findAll(user, null, (err, slices) => {
            slices.length.should.eql(testData.followedSlices.length - 1, 'followed slices');

            const deletedSlice = _.find(slices, (slice) => slice.id === deletedId);
            should.not.exist(deletedSlice);

            stepDone();
          });
        },
      ],
      done);
    });

    it('[UATV] must return a correct error if the followed slice does not exist', (done) => {
      request.del(path('unknown-id')).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });
  });

  function resetFollowedSlices(done) {
    followedSlicesNotifCount = 0;
    testData.resetFollowedSlices(done, testData.users[0]);
  }
});
