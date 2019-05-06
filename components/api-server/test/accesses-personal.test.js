// @flow

/*global describe, before, beforeEach, it */
require('./test-helpers'); 
const helpers = require('./helpers');
const ErrorIds = require('components/errors').ErrorIds;
const server = helpers.dependencies.instanceManager;
const async = require('async');
const validation = helpers.validation;
const methodsSchema = require('../src/schema/accessesMethods');
const should = require('should');
const storage = helpers.dependencies.storage.user.accesses;
const streamsStorage = helpers.dependencies.storage.user.streams;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const R = require('ramda');

describe('accesses (personal)', function () {

  const user = testData.users[0];
  const basePath = '/' + user.username + '/accesses';
  
  let sessionAccessId = null;
  let request = null;
  
  function path(id) {
    return basePath + '/' + id;
  }
  
  function req(): typeof helpers.request {
    if (request == null) { throw Error('request was null'); }
    return request; 
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
        if (request == null) { stepDone('request is null'); }
        storage.findOne(user, {token: request && request.token}, null, function (err, access) {
          sessionAccessId = access.id;
          stepDone();
        });
      }
    ], done);
  });

  describe('GET /', function () {

    before(resetAccesses);

    it('DV3U-must return all accesses (including personal ones)', function (done) {
      req().get(basePath).end(function (res) {
        const expected = validation
          .removeDeletions(testData.accesses)
          .map(a => _.omit(a, 'calls'));

        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {
            accesses: _.sortBy(expected, 'name')
          }
        }, done);
      });
    });

  });

  describe('POST /', function () {

    beforeEach(function (done) {
      async.series([
        resetAccesses,
        testData.resetStreams
      ], done);
    });

    it('12SU-must create a new shared access with the sent data, returning it', (done) => {
      const data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };
      let originalCount,
      
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
          req().post(basePath).send(data).end(function (res) {
            time = timestamp.now();
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result
            });
            createdAccess = res.body.access;
            should(
              accessesNotifCount
            ).be.eql(1, 'accesses notifications');
            stepDone();
          });
        },
        function verifyData(stepDone) {
          storage.findAll(user, null, function (err, accesses) {
            accesses.length.should.eql(originalCount + 1, 'accesses');

            const expected = {
              id: createdAccess.id, 
              token: createdAccess.token, 
              type: 'shared', 
              created: time, 
              modified: time, 
              createdBy: sessionAccessId, 
              modifiedBy: sessionAccessId, 
              name: 'New Access',
              permissions: [
                {
                  streamId: testData.streams[0].id,
                  level: 'read'
                }
              ]
            };

            var actual = _.find(accesses, function (access) {
              return access.id === createdAccess.id;
            });
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        }
      ], done);
    });

    it('DD60-must create a new app access with the sent data, creating/restoring requested streams',
      function (done) {
        var data = {
          id: undefined, 
          token: undefined, 
          created: undefined, 
          createdBy: undefined, 
          modified: undefined, 
          modifiedBy: undefined, 
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
            req().post(basePath).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });

              var expected = R.clone(data);
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

              should(accessesNotifCount).be.eql(1, 'accesses notifications');
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

    it('79QY-must accept two app accesses with the same name (app ids) but different device names',
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

        req().post(basePath).send(data).end(function (res) {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result
          }, done);
        });
      });

    it('50AM-must ignore erroneous requests to create new streams', function (done) {
      var data = {
        id: undefined,          // declare property for flow
        token: undefined,       // declare property for flow 
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
      req().post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });

        var expected = R.clone(data);
        expected.id = res.body.access.id;
        expected.token = res.body.access.token;
        delete expected.permissions[0].defaultName;
        validation.checkObjectEquality(res.body.access, expected);

        should(accessesNotifCount).be.eql(1, 'accesses notifications');
        done();
      });
    });

    it('6BL2-must fail if a stream similar to that requested for creation already exists', (done) => {
      const data = {
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
      req().post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {name: testData.streams[0].name}
        }, done);
      });
    });

    it('UFE7-must refuse to create new personal accesses (obtained via login only)', function (done) {
      var data = {
        token: 'client-defined-token',
        name: 'New Personal Access',
        type: 'personal'
      };
      req().post(basePath).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('YTMG-must slugify the new access\' predefined token', function (done) {
      var data = {
        token: 'pas encodé de bleu!',
        name: 'Genevois, cette fois',
        permissions: []
      };

      req().post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });
        res.body.access.token.should.eql('pas-encode-de-bleu');
        done();
      });
    });

    it('3F4D-must return an error if the sent data is badly formatted', function (done) {
      var data = {
        name: 'New Access',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'bad-level'
          }
        ]
      };
      req().post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('1ELC-must refuse empty `defaultName` values for streams', function (done) {
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
      req().post(basePath).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('ZZSC-must return an error if an access with the same token already exists', function (done) {
      var data = {
        token: testData.accesses[1].token,
        name: 'Duplicate',
        permissions: []
      };
      req().post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists
        }, done);
      });
    });

    it('MSFK-must return an error if an access with the same name already exists',
      function (done) {
        var data = {
          name: testData.accesses[2].name,
          permissions: []
        };
        req().post(basePath).send(data).end(function (res) {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.ItemAlreadyExists,
            data: { type: 'shared', name: testData.accesses[2].name }
          }, done);
        });
      });

    it('9ICB-must return an error if an "app" access with the same name (app id) and device ' +
        'name already exists', function (done) {
      var existing = testData.accesses[4];
      var data = {
        type: existing.type,
        name: existing.name,
        deviceName: existing.deviceName,
        permissions: []
      };
      req().post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { type: existing.type, name: existing.name, deviceName: existing.deviceName }
        }, done);
      });
    });

    it('WRSP-must return an error if the device name is set for a non-app access',
      function (done) {
        var data = {
          name: 'Yikki-yikki',
          deviceName: 'Impossible Device'
        };
        req().post(basePath).send(data).end(function (res) {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidParametersFormat
          }, done);
        });
      });

    it('IHSE-must return an error if the given predefined access\'s token is a reserved word', (done) => {
      const data = {
        token: 'null',
        name: 'Badly Named Access',
        permissions: []
      };
      req().post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidItemId
        }, done);
      });
    });

  });

  describe('PUT /<token>', function () {

    beforeEach(resetAccesses);

    it('6TU5-must modify the shared access with the sent data', function (done) {
      var original = _.omit(testData.accesses[1], 'calls'),
          time;
      var data = {
        name: 'Updated Access 1',
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'read'
          }
        ]
      };
      req().put(path(original.id)).send(data).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });
        
        const expected = {
          modified: time, 
          modifiedBy: sessionAccessId, 
          name: 'Updated Access 1',
          permissions: [
            {
              streamId: testData.streams[0].id,
              level: 'read'
            }
          ]
        };
        _.defaults(expected, original);

        validation.checkObjectEquality(res.body.access, expected);

        should(
          accessesNotifCount
        ).be.eql(1, 'accesses notifications');
        done();
      });
    });

    it('1O8N-must modify the personal access with the specified data', function (done) {
      req().put(path(testData.accesses[0].id)).send({name: 'Updated!'}).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });
        should(accessesNotifCount).be.eql(1, 'accesses notifications');
        done();
      });
    });

    it('7S5L-must return an error if the access does not exist', function (done) {
      req().put(path('unknown-id')).send({name: '?'}).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('RUMK-must return an error if the sent data is badly formatted', function (done) {
      var data = {
        permissions: [
          {
            streamId: testData.streams[0].id,
            level: 'bad-level'
          }
        ]
      };
      req().put(path(testData.accesses[1].id)).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('M8FO-must return an error if an access with the same name and type already exists', (done) => {
      req()
        .put(path(testData.accesses[1].id))
        .send({name: testData.accesses[2].name})
        .end(function (res) {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.ItemAlreadyExists,
            data: { type: testData.accesses[2].type, name: testData.accesses[2].name }
          }, done);
        });
    });
    
    describe('forbidden updates of protected fields', function () {
      const access = {
        name: 'Forbidden access update test',
        permissions:[{
          streamId: 'work',
          level: 'read'
        }],
      };
      let accessId;
      
      beforeEach(function (done) {
        req().post(basePath).send(access).end(function (res) {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result
          });
          accessId = res.body.access.id;
          done();
        });
      });
    
      it('N41N-must prevent update of protected fields and throw a forbidden error in strict mode', function (done) {
        const forbiddenUpdate = {
          id: 'forbidden',
          token: 'forbidden',
          type: 'personal',
          lastUsed: 1,
          created: 1,
          createdBy: 'bob',
          modified: 1,
          modifiedBy: 'alice'
        };
        
        async.series([
          function instanciateServerWithStrictMode(stepDone) {
            setIgnoreProtectedFieldUpdates(false, stepDone);
          },
          function testForbiddenUpdate(stepDone) {
            req().put(path(accessId)).send(forbiddenUpdate).end(function (res) {
              validation.checkError(res, {
                status: 403,
                id: ErrorIds.Forbidden
              }, stepDone);
            });
          }
        ], done);
      });
      
      it('PKRK-must prevent update of protected fields and log a warning in non-strict mode', function (done) {
        const forbiddenUpdate = {
          id: 'forbidden',
          token: 'forbidden',
          type: 'personal',
          lastUsed: 1,
          created: 1,
          createdBy: 'bob',
          modified: 1,
          modifiedBy: 'alice'
        };
        
        async.series([
          function instanciateServerWithNonStrictMode(stepDone) {
            setIgnoreProtectedFieldUpdates(true, stepDone);
          },
          function testForbiddenUpdate(stepDone) {
            req().put(path(accessId)).send(forbiddenUpdate).end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result
              });
              const access = res.body.access;
              should(access.id).not.be.equal(forbiddenUpdate.id);
              should(access.token).not.be.equal(forbiddenUpdate.token);
              should(access.type).not.be.equal(forbiddenUpdate.type);
              should(access.lastUsed).not.be.equal(forbiddenUpdate.lastUsed);
              should(access.created).not.be.equal(forbiddenUpdate.created);
              should(access.createdBy).not.be.equal(forbiddenUpdate.createdBy);
              should(access.modified).not.be.equal(forbiddenUpdate.modified);
              should(access.modifiedBy).not.be.equal(forbiddenUpdate.modifiedBy);
              stepDone();
            });
          }
        ], done);
      });
      
      function setIgnoreProtectedFieldUpdates(activated, stepDone) {
        let settings = _.cloneDeep(helpers.dependencies.settings);
        settings.updates.ignoreProtectedFields = activated;
        server.ensureStarted.call(server, settings, stepDone);
      }
      
      it('15VH-must forbid to elevate a read level into a manage level using a contribute access ', function (done) {
        // In this test we reproduce a situation in which an attacker who
        // was granted a contribute app access can elevate the privileges
        // by creating a sub read access and then update it to manage.
        // Note that this can be combined with the other exploit below,
        // which results in a manage access of every streams.
        // https://github.com/pryv/service-core/issues/108
        
        const streamId = testData.streams[0].id;
        const read = {
          name: 'Read Access',
          permissions: [
            {
              streamId: streamId,
              level: 'read'
            }
          ]
        };
        const contribute = {
          name: 'Contribute Access',
          type: 'app',
          permissions: [
            {
              streamId: streamId,
              level: 'contribute'
            }
          ]
        };
        
        let readAccess;
        let contributeAccess;

        async.series([
          function grantContributeAccess(stepDone) {
            req().post(basePath).send(contribute).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              contributeAccess = res.body.access;
              stepDone();
            });
          },
          function createSubReadAccess(stepDone) {
            req().post(basePath, contributeAccess.token).send(read).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              readAccess = res.body.access;
              stepDone();
            });
          },
          function elevateReadToManage(stepDone) {
            req().put(path(readAccess.id), contributeAccess.token).send({
              'permissions': [{streamId: streamId, level: 'manage'}]
            }).end(function (res) {
              validation.checkErrorForbidden(res, stepDone);
            });
          }
        ], done);
      });
      
      it('7K7Q-must forbid to extend the permission streamIds beyond the authorized context ', function (done) {
        // In this test we reproduce a situation in which an attacker who
        // was granted a contribute app access can elevate the privileges
        // by creating a sub read access and then update it to access all streams.
        // Note that this can be combined with the other exploit above,
        // which results in a manage access of every streams.
        // https://github.com/pryv/service-core/issues/108
        
        const streamId = testData.streams[0].id;
        const read = {
          name: 'Read Access',
          permissions: [
            {
              streamId: streamId,
              level: 'read'
            }
          ]
        };
        const contribute = {
          name: 'Contribute Access',
          type: 'app',
          permissions: [
            {
              streamId: streamId,
              level: 'contribute'
            }
          ]
        };
        
        let readAccess;
        let contributeAccess;

        async.series([
          function grantContributeAccess(stepDone) {
            req().post(basePath).send(contribute).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              contributeAccess = res.body.access;
              stepDone();
            });
          },
          function createSubReadAccess(stepDone) {
            req().post(basePath, contributeAccess.token).send(read).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              readAccess = res.body.access;
              stepDone();
            });
          },
          function extendPermissions(stepDone) {
            req().put(path(readAccess.id), contributeAccess.token).send({
              'permissions': [{streamId: '*', level: 'read'}]
            }).end(function (res) {
              validation.checkErrorForbidden(res, stepDone);
            });
          }
        ], done);
      });
      
    });
  });

  describe('DELETE /<token>', function () {
  
    beforeEach(resetAccesses);
  
    it('DP0O-must delete the shared access', (done) => {
      const deletedAccess = testData.accesses[1];
      let deletionTime;
      
      async.series([
        function deleteAccess(stepDone) {
          req().del(path(deletedAccess.id)).end(function (res) {
            deletionTime = timestamp.now();
            validation.check(res, {
              status: 200,
              schema: methodsSchema.del.result,
              body: {accessDeletion: {id: deletedAccess.id}}
            });
            should(accessesNotifCount).be.eql(1, 'accesses notifications');
            stepDone();
          });
        },
        function verifyData(stepDone) {
          storage.findAll(user, null, function (err, accesses) {
            accesses.length.should.eql(testData.accesses.length, 'accesses');

            var expected = _.assign({
              deleted: deletionTime
            }, deletedAccess);
            var actual = _.find(accesses, {id: deletedAccess.id});
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        }
      ],
      done
      );
    });
  
    it('A9OM-must delete the personal access', function (done) {
      req().del(path(testData.accesses[0].id)).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result
        });
        should(accessesNotifCount).be.eql(1, 'accesses notifications');
        done();
      });
    });
  
    it('FG96-must return an error if the access does not exist', function (done) {
      req().del(path('unknown-id')).end(function (res) {
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

    it('8VWR-must return the adjusted permissions structure if no access exists', function (done) {
      var data = {
        requestingAppId: 'the-love-generator',
        deviceName: 'It\'s a washing machine that sends tender e-mails to your grandmother!',
        requestedPermissions: [
          {
            name: 'myaccess', 
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
      req().post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);

        var expected = R.clone(data.requestedPermissions);
        expected[0].name = testData.streams[0].name;
        delete expected[0].defaultName;

        res.body.checkedPermissions.should.eql(expected);

        done();
      });
    });

    it('F2K1-must accept requested permissions with "*" for "all streams"', function (done) {
      var data = {
        requestingAppId: 'lobabble-dabidabble',
        deviceName: 'It\'s a matchbox that sings the entire repertoire of Maria Callas!',
        requestedPermissions: [
          {
            name: 'myaccess', 
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
      req().post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);

        var expected = R.clone(data.requestedPermissions);
        expected[0].name = testData.streams[0].name;
        delete expected[0].defaultName;
        delete expected[1].defaultName;

        res.body.checkedPermissions.should.eql(expected);

        done();
      });
    });

    it('CF5M-must return the existing app access if matching', function (done) {
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
      req().post(path).send(data).end(function (res) {
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

    it('3AL2-must also return the token of the existing mismatching access if any', function (done) {
      var data = {
        requestingAppId: testData.accesses[4].name,
        deviceName: testData.accesses[4].deviceName,
        requestedPermissions: [
          {
            name: 'foobar', 
            streamId: testData.streams[0].id,
            level: 'manage',
            defaultName: 'This permission differs from the existing access\' permissions'
          }
        ]
      };
      req().post(path).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.checkApp.result
        });

        should.exist(res.body.checkedPermissions);

        var expected = R.clone(data.requestedPermissions);
        expected[0].name = testData.streams[0].name;
        delete expected[0].defaultName;

        res.body.checkedPermissions.should.eql(expected);

        should.exist(res.body.mismatchingAccess);
        res.body.mismatchingAccess.id.should.eql(testData.accesses[4].id);

        should.not.exist(res.body.matchingAccess);

        done();
      });
    });

    it('B9T5-must propose fixes to duplicate ids of streams and signal an error when appropriate',
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
        req()
          .post(path).send(data).end(function (res) {
            validation.check(res, {
              status: 200,
              schema: methodsSchema.checkApp.result
            });

            should.exist(res.body.checkedPermissions);
            should.exist(res.body.error);
            res.body.error.id.should.eql(ErrorIds.ItemAlreadyExists);

            var expected = R.clone(data.requestedPermissions);
            expected[0].defaultName = testData.streams[3].name + ' (1)';

            res.body.checkedPermissions.should.eql(expected);

            done();
          });
      });

    it('ZK2S-must return an error if the sent data is badly formatted', function (done) {
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
      req().post(path).send(data).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('7FUV-must be forbidden to non-personal accesses', function (done) {
      var data = {
        requestingAppId: testData.accesses[4].name,
        requestedPermissions: []
      };
      req().post(path, testData.accesses[4].token).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });

  function resetAccesses(done) {
    accessesNotifCount = 0;
    testData.resetAccesses(done, null, request && request.token);
  }

});

