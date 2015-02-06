/*global describe, before, beforeEach, it */

var helpers = require('./helpers'),
    ErrorIds = require('../src/errors/ErrorIds'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    validation = helpers.validation,
    methodsSchema = require('../src/schema/accessesMethods'),
    should = require('should'), // explicit require to benefit from static functions
    storage = helpers.dependencies.storage.user.accesses,
    streamsStorage = helpers.dependencies.storage.user.streams,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    _ = require('lodash');

describe('accesses (personal)', function () {

  var user = testData.users[0],
      basePath = '/' + user.username + '/accesses',
      // these must be set after server instance started
      request = null,
      sessionAccessId = null;

  function path(id) {
    return basePath + '/' + id;
  }

  // to verify data change notifications
  var accessesNotifCount;
  server.on('accesses-changed', function () { accessesNotifCount++; });

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetStreams,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      },
      function (stepDone) {
        storage.findOne(user, {token: request.token}, null, function (err, access) {
          sessionAccessId = access.id;
          stepDone();
        });
      }
    ], done);
  });

  describe('GET /', function () {

    before(resetAccesses);

    it('must return all accesses (including personal ones)', function (done) {
      request.get(basePath).end(function (res) {
        var expected = validation.removeDeletions(testData.accesses).map(function (a) {
          return _.omit(a, 'calls');
        });
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {
            accesses: _.sortBy(expected, 'name')
          }
        }, done);
      });
    });

    it('must not keep accesses deletions past a certain time ' +
        '(cannot test because cannot force-run Mongo\'s TTL cleanup task)');

  });

  describe('POST /', function () {

    beforeEach(function (done) {
      async.series([
        resetAccesses,
        testData.resetStreams
      ], done);
    });

    it('must create a new shared access with the sent data, returning it', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };
      var originalCount,
          createdAccess,
          time;

      async.series([
          function countInitial(stepDone) {
            storage.countAll(user, function (err, count) {
              originalCount = count;
              stepDone();
            });
          },
          function addNew(stepDone) {
            request.post(basePath).send(data).end(function (res) {
              time = timestamp.now();
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              createdAccess = res.body.access;
              accessesNotifCount.should.eql(1, 'accesses notifications');
              stepDone();
            });
          },
          function verifyData(stepDone) {
            storage.findAll(user, null, function (err, accesses) {
              accesses.length.should.eql(originalCount + 1, 'accesses');

              var expected = _.clone(data);
              expected.id = createdAccess.id;
              expected.token = createdAccess.token;
              expected.type = 'shared';
              expected.created = expected.modified = time;
              expected.createdBy = expected.modifiedBy = sessionAccessId;
              var actual = _.find(accesses, function (access) {
                return access.id === createdAccess.id;
              });
              validation.checkObjectEquality(actual, expected);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('must create a new app access with the sent data, creating/restoring requested streams',
        function (done) {
      var data = {
        name: 'my-sweet-app',
        type: 'app',
        deviceName: 'My Sweet Device',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'contribute',
            name: 'This should be ignored'
          },
          {
            streamId: 'new-stream',
            level: 'manage',
            defaultName: 'New stream'
          },
          {
            streamId: testData.streams[3].id,
            level: 'contribute',
            defaultName: 'Trashed stream to restore (this should be ignored)'
          },
          {
            streamId: '*',
            level: 'read',
            defaultName: 'Ignored, must be cleaned up'
          }
        ]
      };

      async.series([
        function addNew(stepDone) {
          request.post(basePath).send(data).end(function (res) {
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result
            });

            var expected = _.cloneDeep(data);
            expected.id = res.body.access.id;
            expected.token = res.body.access.token;
            delete expected.permissions[0].name;
            delete expected.permissions[1].defaultName;
            delete expected.permissions[2].defaultName;
            delete expected.permissions[3].defaultName;
            delete expected.created;
            delete expected.createdBy;
            delete expected.modified;
            delete expected.modifiedBy;

            validation.checkObjectEquality(res.body.access, expected);

            accessesNotifCount.should.eql(1, 'accesses notifications');
            stepDone();
          });
        },
        function verifyNewStream(stepDone) {
          var query = {id: data.permissions[1].streamId};
          streamsStorage.findOne(user, query, null, function (err, stream) {
            should.not.exist(err);
            should.exist(stream);
            validation.checkStoredItem(stream, 'stream');
            stream.name.should.eql(data.permissions[1].defaultName);
            stepDone();
          });
        },
        function verifyRestoredStream(stepDone) {
          var query = {id: data.permissions[2].streamId};
          streamsStorage.findOne(user, query, null, function (err, stream) {
            should.not.exist(err);
            should.exist(stream);
            should.not.exist(stream.trashed);
            stepDone();
          });
        }
      ], done);
    });

    it('must accept two app accesses with the same name (app ids) but different device names',
        function (done) {
      var data = {
        name: testData.accesses[4].name,
        type: 'app',
        deviceName: 'Calvin\'s Fantastic Cerebral Enhance-o-tron',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };

      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        }, done);
      });
    });

    it('must ignore erroneous requests to create new streams', function (done) {
      var data = {
        name: 'my-sweet-app-id',
        type: 'app',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read',
            defaultName: 'This property should be ignored as the stream already exists'
          }
        ]
      };
      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        var expected = _.cloneDeep(data);
        expected.id = res.body.access.id;
        expected.token = res.body.access.token;
        delete expected.permissions[0].defaultName;
        validation.checkObjectEquality(res.body.access, expected);

        accessesNotifCount.should.eql(1, 'accesses notifications');
        done();
      });
    });

    it('must fail if a stream similar to that requested for creation already exists',
        function (done) {
      var data = {
        name: 'my-sweet-app-id',
        type: 'app',
        permissions: [
          {
            streamId: 'bad-new-stream',
            level: 'contribute',
            defaultName: testData.streams[0].name
          }
        ]
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {name: testData.streams[0].name}
        }, done);
      });
    });

    it('must refuse to create new personal accesses (obtained via login only)', function (done) {
      var data = {
        token: 'client-defined-token',
        name: 'New Personal Access',
        type: 'personal'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('must slugify the new access\' predefined token', function (done) {
      var data = {
        token: 'pas encodé de bleu!',
        name: 'Genevois, cette fois',
        permissions: []
      };

      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });
        res.body.access.token.should.eql('pas-encode-de-bleu');
        done();
      });
    });

    it('must return an error if the sent data is badly formatted', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'bad-level'
          }
        ]
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must refuse empty `defaultName` values for streams', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read',
            defaultName: '   '
          }
        ]
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must return an error if an access with the same token already exists', function (done) {
      var data = {
        token: testData.accesses[1].token,
        name: 'Duplicate',
        permissions: []
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {token: testData.accesses[1].token}
        }, done);
      });
    });

    it('must return an error if an access with the same name already exists',
        function (done) {
      var data = {
        name: testData.accesses[2].name,
        permissions: []
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { type: 'shared', name: testData.accesses[2].name }
        }, done);
      });
    });

    it('must return an error if an "app" access with the same name (app id) and device ' +
        'name already exists', function (done) {
      var existing = testData.accesses[4];
      var data = {
        type: existing.type,
        name: existing.name,
        deviceName: existing.deviceName,
        permissions: []
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { type: existing.type, name: existing.name, deviceName: existing.deviceName }
        }, done);
      });
    });

    it('must return an error if the device name is set for a non-app access',
        function (done) {
      var data = {
        name: 'Yikki-yikki',
        deviceName: 'Impossible Device'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat
        }, done);
      });
    });

    it('must return an error if the given predefined access\'s token is a reserved word',
        function (done) {
      var data = {
        token: 'null',
        name: 'Badly Named Access',
        permissions: []
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidItemId
        }, done);
      });
    });

  });

  describe('PUT /<token>', function () {

    beforeEach(resetAccesses);

    it('must modify the shared access with the sent data', function (done) {
      var original = _.omit(testData.accesses[1], 'calls'),
          time;
      var data = {
        token: 'Ratata', // to check if properly ignored
        name: 'Updated Access 1',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };
      request.put(path(original.id)).send(data).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expected = _.clone(data);
        delete expected.token;
        expected.modified = time;
        expected.modifiedBy = sessionAccessId;
        _.defaults(expected, original);

        validation.checkObjectEquality(res.body.access, expected);

        accessesNotifCount.should.eql(1, 'accesses notifications');
        done();
      });
    });

    it('must modify the personal access with the specified data', function (done) {
      request.put(path(testData.accesses[0].id)).send({name: 'Updated!'}).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });
        accessesNotifCount.should.eql(1, 'accesses notifications');
        done();
      });
    });

    it('must return an error if the access does not exist', function (done) {
      request.put(path('unknown-id')).send({name: '?'}).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('must return an error if the sent data is badly formatted', function (done) {
      var data = {
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'bad-level'
          }
        ]
      };
      request.put(path(testData.accesses[1].id)).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must return an error if an access with the same name and type already exists',
        function (done) {
      request.put(path(testData.accesses[1].id)).send({name: testData.accesses[2].name})
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { type: testData.accesses[2].type, name: testData.accesses[2].name }
        }, done);
      });
    });

  });

  describe('DELETE /<token>', function () {

    beforeEach(resetAccesses);

    it('must delete the shared access', function (done) {
      var deletedAccess = testData.accesses[1],
          deletionTime;
      async.series([
          function deleteAccess(stepDone) {
            request.del(path(deletedAccess.id)).end(function (res) {
              deletionTime = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result,
                body: {accessDeletion: {id: deletedAccess.id}}
              });
              accessesNotifCount.should.eql(1, 'accesses notifications');
              stepDone();
            });
          },
          function verifyData(stepDone) {
            storage.findAll(user, null, function (err, accesses) {
              accesses.length.should.eql(testData.accesses.length, 'accesses');

              var expected = _.extend({
                _token: deletedAccess.token,
                _type: deletedAccess.type,
                _name: deletedAccess.name,
                deleted: deletionTime
              }, _.omit(deletedAccess, 'token', 'type', 'name'));
              var actual = _.find(accesses, {id: deletedAccess.id});
              validation.checkObjectEquality(actual, expected);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('must delete the personal access', function (done) {
      request.del(path(testData.accesses[0].id)).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result
        });
        accessesNotifCount.should.eql(1, 'accesses notifications');
        done();
      });
    });

    it('must return an error if the access does not exist', function (done) {
      request.del(path('unknown-id')).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

  describe('POST /check-app', function () {

    before(resetAccesses);

    var path = basePath + '/check-app';

    it('must return the adjusted permissions structure if no access exists', function (done) {
      var data = {
        requestingAppId: 'the-love-generator',
        deviceName: 'It\'s a washing machine that sends tender e-mails to your grandmother!',
        requestedPermissions: [
          {
            streamId: testData.streams[0].id,
            level: 'contribute',
            defaultName: 'A different name'
          },
          {
            streamId: 'new-stream',
            level: 'manage',
            defaultName: 'The New Stream, Sir.'
          }
        ]
      };
      request.post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);

        var expected = _.cloneDeep(data.requestedPermissions);
        expected[0].name = testData.streams[0].name;
        delete expected[0].defaultName;

        res.body.checkedPermissions.should.eql(expected);

        done();
      });
    });

    it('must accept requested permissions with "*" for "all streams"', function (done) {
      var data = {
        requestingAppId: 'lobabble-dabidabble',
        deviceName: 'It\'s a matchbox that sings the entire repertoire of Maria Callas!',
        requestedPermissions: [
          {
            streamId: testData.streams[0].id,
            level: 'manage',
            defaultName: 'A different name'
          },
          {
            streamId: '*',
            level: 'read',
            defaultName: 'Ignored, must be cleaned up'
          }
        ]
      };
      request.post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);

        var expected = _.cloneDeep(data.requestedPermissions);
        expected[0].name = testData.streams[0].name;
        delete expected[0].defaultName;
        delete expected[1].defaultName;

        res.body.checkedPermissions.should.eql(expected);

        done();
      });
    });

    it('must return the existing app access if matching', function (done) {
      var data = {
        requestingAppId: testData.accesses[4].name,
        deviceName: testData.accesses[4].deviceName,
        requestedPermissions: [
          {
            streamId: testData.streams[0].id,
            level: 'contribute',
            defaultName: 'This permission is the same as the existing access\'s'
          }
        ]
      };
      request.post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.matchingAccess);
        res.body.matchingAccess.token.should.eql(testData.accesses[4].token);

        should.not.exist(res.body.checkedPermissions);
        should.not.exist(res.body.mismatchingAccess);

        done();
      });
    });

    it('must also return the token of the existing mismatching access if any', function (done) {
      var data = {
        requestingAppId: testData.accesses[4].name,
        deviceName: testData.accesses[4].deviceName,
        requestedPermissions: [
          {
            streamId: testData.streams[0].id,
            level: 'manage',
            defaultName: 'This permission differs from the existing access\' permissions'
          }
        ]
      };
      request.post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);

        var expected = _.cloneDeep(data.requestedPermissions);
        expected[0].name = testData.streams[0].name;
        delete expected[0].defaultName;

        res.body.checkedPermissions.should.eql(expected);

        should.exist(res.body.mismatchingAccess);
        res.body.mismatchingAccess.id.should.eql(testData.accesses[4].id);

        should.not.exist(res.body.matchingAccess);

        done();
      });
    });

    it('must propose fixes to duplicate ids of streams and signal an error when appropriate',
        function (done) {
      var data = {
        requestingAppId: 'the-love-generator',
        requestedPermissions: [
          {
            streamId: 'bad-new-stream',
            level: 'contribute',
            defaultName: testData.streams[3].name
          }
        ]
      };
      request.post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);
        should.exist(res.body.error);
        res.body.error.id.should.eql(ErrorIds.ItemAlreadyExists);

        var expected = _.cloneDeep(data.requestedPermissions);
        expected[0].defaultName = testData.streams[3].name + ' (1)';

        res.body.checkedPermissions.should.eql(expected);

        done();
      });
    });

    it('must return an error if the sent data is badly formatted', function (done) {
      var data = {
        requestingAppId: testData.accesses[4].name,
        requestedPermissions: [
          {
            streamId: testData.streams[0].id,
            level: 'manage',
            RATATA: 'But-but-but this property has nothing to do here!!!'
          }
        ]
      };
      request.post(path).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must be forbidden to non-personal accesses', function (done) {
      var data = {
        requestingAppId: testData.accesses[4].name,
        requestedPermissions: []
      };
      request.post(path, testData.accesses[4].token).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  function resetAccesses(done) {
    accessesNotifCount = 0;
    testData.resetAccesses(done, null, request.token);
  }

});
