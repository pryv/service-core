/*global describe, before, beforeEach, it */

var helpers = require('./helpers'),
    server = helpers.dependencies.instanceManager,
    async = require('async'),
    commonTests = helpers.commonTests,
    fs = require('fs'),
    validation = helpers.validation,
    ErrorIds = require('components/errors').ErrorIds,
    eventsStorage = helpers.dependencies.storage.user.events,
    eventFilesStorage = helpers.dependencies.storage.user.eventFiles,
    methodsSchema = require('../src/schema/streamsMethods'),
    should = require('should'), // explicit require to benefit from static functions
    storage = helpers.dependencies.storage.user.streams,
    testData = helpers.data,
    timestamp = require('unix-timestamp'),
    treeUtils = require('components/utils').treeUtils,
    _ = require('lodash');

describe('streams', function () {

  var user = testData.users[0],
      initialRootStreamId = testData.streams[0].id,
      basePath = '/' + user.username + '/streams',
      // these must be set after server instance started
      request = null,
      accessId = null;

  function path(id) {
    return basePath + '/' + id;
  }

  // to verify data change notifications
  var streamsNotifCount,
      eventsNotifCount;
  server.on('streams-changed', function () { streamsNotifCount++; });
  server.on('events-changed', function () { eventsNotifCount++; });

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      },
      function (stepDone) {
        helpers.dependencies.storage.user.accesses.findOne(user, {token: request.token},
            null, function (err, access) {
          accessId = access.id;
          stepDone();
        });
      }
    ], done);
  });

  describe('GET /', function () {

    before(resetData);

    it('must return non-trashed streams (as a tree) by default', function (done) {
      request.get(basePath).end(function (res) {
        // manually filter out trashed items
        var expected = treeUtils.filterTree(validation.removeDeletionsAndHistory(testData.streams),
          false, function (s) { return !s.trashed; });
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {streams: expected}
        }, done);
      });
    });

    it('must return all streams (trashed or not) when requested', function (done) {
      request.get(basePath).query({state: 'all'}).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {streams: _.sortBy(validation.removeDeletions(testData.streams), 'name')}
        }, done);
      });
    });

    it('must include stream deletions (since the given time) when requested', function (done) {
      var params = {includeDeletionsSince: timestamp.now('-45m')};
      request.get(basePath).query(params).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result
        });
        res.body.streamDeletions.should.eql(_.at(testData.streams, 4));
        done();
      });
    });

    it('must not keep stream deletions past a certain time ' +
        '(cannot test because cannot force-run Mongo\'s TTL cleanup task)');

    it('must return a correct 401 error if no access token is provided', function (done) {
      commonTests.checkAccessTokenAuthentication(server.url, basePath, done);
    });

    it('must return child streams when providing a parent stream id', function (done) {
      request.get(basePath).query({parentId: initialRootStreamId}).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: {streams: testData.streams[0].children}
        }, done);
      });
    });

    it('must return a correct error if the parent stream is unknown', function (done) {
      request.get(basePath).query({parentId: 'unknownStreamId'}).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: {parentId: 'unknownStreamId'}
        }, done);
      });
    });

  });

  describe('POST /', function () {

    beforeEach(resetData);

    it('must create a new "root" stream with the sent data, returning it', function (done) {
      var data = {
        name: 'Test Root Stream',
        clientData: {
          testClientDataField: 'testValue'
        },
        // included to make sure it's properly ignored and stripped before storage
        children: [{name: 'should be ignored'}]
      };
      var originalCount,
          createdStream,
          time;

      async.series([
        function countInitialRootStreams(stepDone) {
          storage.count(user, {parentId: {$type: 10}}, function (err, count) {
            originalCount = count;
            stepDone();
          });
        },
        function addNewStream(stepDone) {
          request.post(basePath).send(data).end(function (res) {
            time = timestamp.now();
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result
            });
            createdStream = res.body.stream;
            streamsNotifCount.should.eql(1, 'streams notifications');
            stepDone();
          });
        },
        function verifyStreamData(stepDone) {
          storage.find(user, {}, null, function (err, streams) {
            streams.length.should.eql(originalCount + 1, 'streams');

            var expected = _.clone(data);
            expected.id = createdStream.id;
            expected.parentId = null;
            expected.created = expected.modified = time;
            expected.createdBy = expected.modifiedBy = accessId;
            expected.children = [];
            var actual = _.find(streams, function (stream) {
              return stream.id === createdStream.id;
            });
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.findOne(user, {id: createdStream.id}, null, function (err, stream) {
            validation.checkStoredItem(stream, 'stream');
            stepDone();
          });
        }
      ], done);
    });

    it('must return a correct error if the sent data is badly formatted', function (done) {
      request.post(basePath).send({badProperty: 'bad value'}).end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must return a correct error if a stream with the same id already exists', function (done) {
      var data = { id: testData.streams[0].id, name: 'Duplicate' };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {id: data.id}
        }, done);
      });
    });

    it('must allow reuse of deleted ids', function (done) {
      var data = {
        id: testData.streams[4].id,
        name: 'New stream reusing previously deleted id',
        parentId: null
      };
      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });
        validation.checkObjectEquality(res.body.stream, data);
        done();
      });
    });

    it('must fail if a sibling stream with the same name already exists', function (done) {
      var data = {name: testData.streams[0].name};
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {name: data.name}
        }, done);
      });
    });

    // this test doesn't apply to streams in particular, but the bug was found here and there's
    // no better location at the moment
    it('must return a correct error if the sent data is not valid JSON', function (done) {
      request.post(basePath).type('json').send('{"someProperty": ”<- bad opening quote"}')
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidRequestStructure
        }, done);
      });
    });

    it('must create a new child stream (with predefined id) when providing a parent stream id',
        function (done) {
      var originalCount;

      async.series([
          function countInitialChildStreams(stepDone) {
            storage.count(user, {parentId: initialRootStreamId}, function (err, count) {
              originalCount = count;
              stepDone();
            });
          },
          function addNewStream(stepDone) {
            var data = {
              id: 'predefined-stream-id',
              name: 'New Child Stream',
              parentId: initialRootStreamId
            };
            request.post(basePath).send(data).end(function (res) {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result
              });
              res.body.stream.id.should.eql(data.id);
              streamsNotifCount.should.eql(1, 'streams notifications');
              stepDone();
            });
          },
          function recountChildStreams(stepDone) {
            storage.count(user, {parentId: initialRootStreamId}, function (err, count) {
              count.should.eql(originalCount + 1);

              stepDone();
            });
          }
        ],
        done
      );
    });

    // Test added to verify fix of issue#29
    it('must return an error if the new stream\'s parentId ' +
      'is the empty string', function (done) {
      var data = {
        name: 'zero-length parentId string Stream',
        parentId: ''
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat
        }, done);
      });
    });

    it('must slugify the new stream\'s predefined id', function (done) {
      var data = {
        id: 'pas encodé de bleu!',
        name: 'Genevois, cette fois'
      };

      request.post(basePath).send(data).end(function (res) {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result
        });
        res.body.stream.id.should.eql('pas-encode-de-bleu');
        done();
      });
    });

    it('must return a correct error if the parent stream is unknown', function (done) {
      var data = {
        name: 'New Child Stream',
        parentId: 'unknown-stream-id'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: {parentId: data.parentId}
        }, done);
      });
    });

    it('must return a correct error if the given predefined stream\'s id is "null"',
        function (done) {
      var data = {
        id: 'null',
        name: 'Badly Named Stream'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidItemId
        }, done);
      });
    });

    it('must return a correct error if the given predefined stream\'s id is "*"',
        function (done) {
      var data = {
        id: '*',
        name: 'Badly Named Stream'
      };
      request.post(basePath).send(data).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidItemId
        }, done);
      });
    });

  });

  describe('PUT /<id>', function () {

    beforeEach(resetData);

    it('must modify the stream with the sent data', function (done) {
      var original = testData.streams[0],
          time;
      var data = {
        id: 'Tralala-itou', // check that properly ignored
        name: 'Updated Root Stream 0',
        clientData: {
          clientField: 'client value'
        },
        // to test if properly stripped and ignored
        children: [{name: 'should be ignored'}]
      };

      request.put(path(original.id)).send(data).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expected = _.clone(data);
        expected.id = original.id;
        expected.parentId = original.parentId;
        expected.singleActivity = original.singleActivity;
        expected.modified = time;
        expected.modifiedBy = accessId;
        delete expected.children;
        validation.checkObjectEquality(res.body.stream, expected);

        streamsNotifCount.should.eql(1, 'streams notifications');
        done();
      });
    });

    it('must add/update/remove the specified client data fields without touching the others',
        function (done) {
      var original = testData.streams[1];
      var data = {
        clientData: {
          booleanProp: true, // add
          stringProp: 'Where Art Thou?', // update
          numberProp: null // delete
        }
      };

      request.put(path(original.id)).send(data).end(function (res) {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result
        });

        var expected = _.clone(original);
        _.extend(expected.clientData, data.clientData);
        delete expected.clientData.numberProp;
        delete expected.modified;
        delete expected.modifiedBy;
        delete expected.children;
        validation.checkObjectEquality(res.body.stream, expected);

        streamsNotifCount.should.eql(1, 'streams notifications');
        done();
      });
    });

    it('must return a correct error if the stream does not exist', function (done) {
      request.put(path('unknown-id')).send({name: '?'}).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

    it('must return a correct error if the sent data is badly formatted', function (done) {
      request.put(path(testData.streams[1].id)).send({badProperty: 'bad value'})
          .end(function (res) {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('must fail if a sibling stream with the same name already exists', function (done) {
      var update = {name: testData.streams[0].name};
      request.put(path(testData.streams[1].id)).send(update).end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: {name: update.name}
        }, done);
      });
    });

    it('must move the stream under the given parent when specified', function (done) {
      var original = testData.streams[0].children[1],
          newParent = testData.streams[1];

      async.series([
        function updateStream(stepDone) {
          request.put(path(original.id)).send({parentId: newParent.id})
              .end(function (res) {
                validation.check(res, {
                  status: 200,
                  schema: methodsSchema.update.result
                });
                streamsNotifCount.should.eql(1, 'streams notifications');
                stepDone();
              });
        },
        function verifyStreamsData(stepDone) {
          storage.find(user, {}, null, function (err, streams) {

            var updated = _.clone(original);
            updated.parentId = newParent.id;
            delete updated.modified;
            delete updated.modifiedBy;
            var expected = _.clone(newParent);
            expected.children = _.clone(newParent.children);
            expected.children.unshift(updated);
            var actual = _.find(streams, function (stream) {
              return stream.id === newParent.id;
            });
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        }
      ], done);
    });

    it('must return a correct error if the new parent stream is unknown', function (done) {
      request.put(path(testData.streams[1].id)).send({parentId: 'unknown-id'})
          .end(function (res) {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: {parentId: 'unknown-id'}
        }, done);
      });
    });
    
    it('must reject update of read-only properties', function (done) {
      var forbiddenUpdate = {
        id: 'forbidden',
        children: [],
        created: 1,
        createdBy: 'bob',
        modified: 1,
        modifiedBy: 'alice'
      };

      request.put(path(testData.streams[0].id)).send(forbiddenUpdate).end(function (res) {
        validation.check(res, {
          status: 403,
          id: ErrorIds.Forbidden,
          data: {forbiddenProperties: forbiddenUpdate}
        }, done);
      });
    });

  });

  describe('DELETE /<id>', function () {

    beforeEach(resetData);

    it('must flag the specified stream as trashed', function (done) {
      var trashedId = testData.streams[0].id,
          time;

      request.del(path(trashedId)).end(function (res) {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result
        });

        var trashedStream = res.body.stream;
        trashedStream.trashed.should.eql(true);
        trashedStream.modified.should.be.within(time - 1, time);
        trashedStream.modifiedBy.should.eql(accessId);

        streamsNotifCount.should.eql(1, 'streams notifications');
        done();
      });
    });

    it('must delete the stream when already trashed with its descendants if there are no linked ' +
        'events', function (done) {
      var parent = testData.streams[2],
          deletedStream = parent.children[1],
          id = deletedStream.id,
          childId = deletedStream.children[0].id,
          expectedDeletion,
          expectedChildDeletion;

      async.series([
	  storage.updateOne.bind(storage, user, {id: id}, {trashed: true}),
          function deleteStream(stepDone) {
            request.del(path(id)).end(function (res) {
              expectedDeletion = {
                id: id,
                deleted: timestamp.now()
              };
              expectedChildDeletion = {
                id: childId,
                deleted: timestamp.now()
              };

              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result
              });
              streamsNotifCount.should.eql(1, 'streams notifications');
              stepDone();
            });
          },
          function verifyStreamData(stepDone) {
            storage.findAll(user, null, function (err, streams) {
              treeUtils.findById(streams, parent.id).children.length
                  .should.eql(testData.streams[2].children.length - 1, 'child streams');

              var deletion = treeUtils.findById(streams, id);
              should.exist(deletion);
              validation.checkObjectEquality(deletion, expectedDeletion);

              var childDeletion = treeUtils.findById(streams, childId);
              should.exist(childDeletion);
              validation.checkObjectEquality(childDeletion, expectedChildDeletion);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('must return a correct error if there are linked events and the related parameter is ' +
        'missing', function (done) {
      var id = testData.streams[0].id;
      async.series([
	  storage.updateOne.bind(storage, user, {id: id}, {trashed: true}),
          function deleteStream(stepDone) {
            request.del(path(testData.streams[0].id)).end(function (res) {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidParametersFormat
              }, stepDone);
            });
          }
        ],
        done
      );
    });

    it('must reassign the linked events to the deleted stream\'s parent when specified',
        function (done) {
      var parentStream = testData.streams[0],
          deletedStream = parentStream.children[1];

      async.series([
	  storage.updateOne.bind(storage, user, {id: deletedStream.id}, {trashed: true}),
          function deleteStream(stepDone) {
            request.del(path(deletedStream.id)).query({mergeEventsWithParent: true})
                .end(function (res) {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result
              });

              streamsNotifCount.should.eql(1, 'streams notifications');
              eventsNotifCount.should.eql(1, 'events notifications');

              stepDone();
            });
          },
          function verifyLinkedEvents(stepDone) {
            eventsStorage.find(user, {streamId: parentStream.id}, null,
                function (err, linkedEvents) {
	      _.map(linkedEvents, 'id').should.eql([
                testData.events[4].id,
                testData.events[3].id,
                testData.events[2].id,
                testData.events[1].id
              ]);

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('must delete the linked events when specified', function (done) {
      var id = testData.streams[0].children[1].id,
          deletedEvents = testData.events.filter(function (e) { return e.streamId === id; }),
          deletedEventWithAtt = deletedEvents[0],
          deletionTime;
      async.series([
          function addEventAttachment(stepDone) {
            request.post('/' + user.username + '/events/' + deletedEventWithAtt.id)
                .attach('image', testData.attachments.image.path,
                    testData.attachments.image.fileName)
                .end(function (res) {
              validation.check(res, {status: 200});
              eventsNotifCount = 0; // reset
              stepDone();
            });
          },
	  storage.updateOne.bind(storage, user, {id: id}, {trashed: true}),
          function deleteStream(stepDone) {
            request.del(path(id)).query({mergeEventsWithParent: false}).end(function (res) {
              deletionTime = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result
              });

              streamsNotifCount.should.eql(1, 'streams notifications');
              eventsNotifCount.should.eql(1, 'events notifications');

              stepDone();
            });
          },
          function verifyLinkedEvents(stepDone) {
            eventsStorage.findAll(user, null, function (err, events) {
              events.length.should.eql(testData.events.length, 'events');

              deletedEvents.forEach(function (e) {
                var actual = _.find(events, {id: e.id}),
                    expected = { id: e.id, deleted: deletionTime };
                validation.checkObjectEquality(actual, expected);
              });

              var dirPath = eventFilesStorage.getAttachedFilePath(user, deletedEventWithAtt.id);
              fs.existsSync(dirPath).should.eql(false, 'deleted event directory existence');

              stepDone();
            });
          }
        ],
        done
      );
    });

    it('must return a correct error if the item is unknown', function (done) {
      request.del(path('unknown_id')).end(function (res) {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource
        }, done);
      });
    });

  });

  function resetData(done) {
    streamsNotifCount = 0;
    eventsNotifCount = 0;
    async.series([
      testData.resetStreams,
      testData.resetEvents
    ], done);
  }

});
