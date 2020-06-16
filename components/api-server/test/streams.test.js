/* global describe, before, beforeEach, it */

require('./test-helpers');
const helpers = require('./helpers');

const server = helpers.dependencies.instanceManager;
const async = require('async');

const { commonTests } = helpers;
const fs = require('fs');

const { validation } = helpers;
const { ErrorIds } = require('components/errors');

const eventsStorage = helpers.dependencies.storage.user.events;
const eventFilesStorage = helpers.dependencies.storage.user.eventFiles;
const methodsSchema = require('../src/schema/streamsMethods');
const should = require('should');
// explicit require to benefit from static function
const storage = helpers.dependencies.storage.user.streams;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const { treeUtils } = require('components/utils');
const _ = require('lodash');

const chai = require('chai');

const { assert } = chai;

describe('streams', () => {
  const user = testData.users[0];
  const initialRootStreamId = testData.streams[0].id;
  const basePath = `/${user.username}/streams`;
  // these must be set after server instance started
  let request = null;
  let accessId = null;

  function path(id) {
    return `${basePath}/${id}`;
  }

  // to verify data change notifications
  let streamsNotifCount;
  let eventsNotifCount;
  server.on('streams-changed', () => { streamsNotifCount++; });
  server.on('events-changed', () => { eventsNotifCount++; });

  before((done) => {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      },
      function (stepDone) {
        helpers.dependencies.storage.user.accesses.findOne(user, { token: request.token },
          null, (err, access) => {
            accessId = access.id;
            stepDone();
          });
      },
    ], done);
  });

  describe('GET /', () => {
    before(resetData);

    it('[TG78] must return non-trashed streams (as a tree) by default', (done) => {
      request.get(basePath).end((res) => {
        // manually filter out trashed items
        const expected = treeUtils.filterTree(validation.removeDeletionsAndHistory(testData.streams),
          false, (s) => !s.trashed);
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { streams: expected },
        }, done);
      });
    });

    it('[DPWG] must return all streams (trashed or not) when requested', (done) => {
      request.get(basePath).query({ state: 'all' }).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { streams: _.sortBy(validation.removeDeletions(testData.streams), 'name') },
        }, done);
      });
    });

    it('[RDD5] must include stream deletions (since the given time) when requested', (done) => {
      const params = { includeDeletionsSince: timestamp.now('-45m') };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
        });
        res.body.streamDeletions.should.eql(_.at(testData.streams, 4));
        done();
      });
    });

    it('[T8AM] must include stream deletions even when the given time is 0', (done) => {
      const params = { includeDeletionsSince: 0 };
      request.get(basePath).query(params).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
        });
        should.exist(res.body.streamDeletions);
        done();
      });
    });

    it('[1M8A] must not keep stream deletions past a certain time '
        + '(cannot test because cannot force-run Mongo\'s TTL cleanup task)');

    it('[W9VC] must return a correct 401 error if no access token is provided', (done) => {
      commonTests.checkAccessTokenAuthentication(server.url, basePath, done);
    });

    it('[UVWK] must return child streams when providing a parent stream id', (done) => {
      request.get(basePath).query({ parentId: initialRootStreamId }).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.get.result,
          body: { streams: testData.streams[0].children },
        }, done);
      });
    });

    it('[AJZL] must return a correct error if the parent stream is unknown', (done) => {
      request.get(basePath).query({ parentId: 'unknownStreamId' }).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: { parentId: 'unknownStreamId' },
        }, done);
      });
    });
  });

  describe('POST /', () => {
    beforeEach(resetData);

    it('[ENVV] must create a new "root" stream with the sent data, returning it', (done) => {
      const data = {
        name: 'Test Root Stream',
        clientData: {
          testClientDataField: 'testValue',
        },
        // included to make sure it's properly ignored and stripped before storage
        children: [{ name: 'should be ignored' }],
      };
      let originalCount;
      let createdStream;
      let time;

      async.series([
        function countInitialRootStreams(stepDone) {
          storage.count(user, { parentId: { $type: 10 } }, (err, count) => {
            originalCount = count;
            stepDone();
          });
        },
        function addNewStream(stepDone) {
          request.post(basePath).send(data).end((res) => {
            time = timestamp.now();
            validation.check(res, {
              status: 201,
              schema: methodsSchema.create.result,
            });
            createdStream = res.body.stream;
            streamsNotifCount.should.eql(1, 'streams notifications');
            stepDone();
          });
        },
        function verifyStreamData(stepDone) {
          storage.find(user, {}, null, (err, streams) => {
            streams.length.should.eql(originalCount + 1, 'streams');

            const expected = _.clone(data);
            expected.id = createdStream.id;
            expected.parentId = null;
            expected.created = expected.modified = time;
            expected.createdBy = expected.modifiedBy = accessId;
            expected.children = [];
            const actual = _.find(streams, (stream) => stream.id === createdStream.id);
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        },
        function verifyStoredItem(stepDone) {
          storage.findOne(user, { id: createdStream.id }, null, (err, stream) => {
            validation.checkStoredItem(stream, 'stream');
            stepDone();
          });
        },
      ], done);
    });

    it('[A2HP] must return a correct error if the sent data is badly formatted', (done) => {
      request.post(basePath).send({ badProperty: 'bad value' }).end((res) => {
        validation.checkErrorInvalidParams(res, done);
      });
    });

    it('[GGS3] must return a correct error if a stream with the same id already exists', (done) => {
      const data = { id: testData.streams[0].id, name: 'Duplicate' };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { id: data.id },
        }, done);
      });
    });

    it('[UHKI] must allow reuse of deleted ids', (done) => {
      const data = {
        id: testData.streams[4].id,
        name: 'New stream reusing previously deleted id',
        parentId: null,
      };
      request.post(basePath).send(data).end((res) => {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result,
        });
        validation.checkObjectEquality(res.body.stream, data);
        done();
      });
    });

    it('[8WGG] must accept explicit null for optional fields', (done) => {
      const data = {
        id: 'nullable',
        name: 'New stream with null fields',
        parentId: null,
        clientData: null,
        children: null,
        trashed: null,
      };
      request.post(basePath).send(data).end((res) => {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result,
        }, done);
      });
    });

    it('[NR4D] must fail if a sibling stream with the same name already exists', (done) => {
      const data = { name: testData.streams[0].name };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { name: data.name },
        }, done);
      });
    });

    // this test doesn't apply to streams in particular, but the bug was found here and there's
    // no better location at the moment
    it('[JINC] must return a correct error if the sent data is not valid JSON', (done) => {
      request.post(basePath).type('json').send('{"someProperty": ”<- bad opening quote"}')
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidRequestStructure,
          }, done);
        });
    });

    it('[CHDM] must create a new child stream (with predefined id) when providing a parent stream id',
      (done) => {
        let originalCount;

        async.series([
          function _countInitialChildStreams(stepDone) {
            storage.count(user, { parentId: initialRootStreamId }, (err, count) => {
              if (err != null) return stepDone(err);

              originalCount = count;
              stepDone();
            });
          },
          function _addNewStream(stepDone) {
            const data = {
              id: 'predefined-stream-id',
              name: 'New Child Stream',
              parentId: initialRootStreamId,
            };
            request.post(basePath).send(data).end((res) => {
              validation.check(res, {
                status: 201,
                schema: methodsSchema.create.result,
              });
              assert.strictEqual(res.body.stream.id, data.id);
              assert.strictEqual(streamsNotifCount, 1);

              stepDone();
            });
          },
          function _recountChildStreams(stepDone) {
            storage.count(user, { parentId: initialRootStreamId }, (err, count) => {
              if (err != null) return stepDone(err);

              try {
                assert.strictEqual(count, originalCount + 1,
                  'Created a child stream.');
              } catch (err) { return stepDone(err); }

              stepDone();
            });
          },
        ],
        done);
      });

    // Test added to verify fix of issue#29
    it('[88VQ] must return an error if the new stream\'s parentId '
      + 'is the empty string', (done) => {
      const data = {
        name: 'zero-length parentId string Stream',
        parentId: '',
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.InvalidParametersFormat,
        }, done);
      });
    });

    it('[84RK] must slugify the new stream\'s predefined id', (done) => {
      const data = {
        id: 'pas encodé de bleu!',
        name: 'Genevois, cette fois',
      };

      request.post(basePath).send(data).end((res) => {
        validation.check(res, {
          status: 201,
          schema: methodsSchema.create.result,
        });
        res.body.stream.id.should.eql('pas-encode-de-bleu');
        done();
      });
    });

    it('[2B3H] must return a correct error if the parent stream is unknown', (done) => {
      const data = {
        name: 'New Child Stream',
        parentId: 'unknown-stream-id',
      };
      request.post(basePath).send(data).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.UnknownReferencedResource,
          data: { parentId: data.parentId },
        }, done);
      });
    });

    it('[8JB5] must return a correct error if the given predefined stream\'s id is "null"',
      (done) => {
        const data = {
          id: 'null',
          name: 'Badly Named Stream',
        };
        request.post(basePath).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidItemId,
          }, done);
        });
      });

    it('[6TPQ] must return a correct error if the given predefined stream\'s id is "*"',
      (done) => {
        const data = {
          id: '*',
          name: 'Badly Named Stream',
        };
        request.post(basePath).send(data).end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.InvalidItemId,
          }, done);
        });
      });
  });

  describe('PUT /<id>', () => {
    beforeEach(resetData);

    it('[SO48] must modify the stream with the sent data', (done) => {
      const original = testData.streams[0];
      let time;
      const data = {
        name: 'Updated Root Stream 0',
        clientData: {
          clientField: 'client value',
        },
      };

      request.put(path(original.id)).send(data).end((res) => {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result,
        });

        const expected = _.clone(data);
        expected.id = original.id;
        expected.parentId = original.parentId;
        expected.modified = time;
        expected.modifiedBy = accessId;
        delete expected.children;
        validation.checkObjectEquality(res.body.stream, expected);

        streamsNotifCount.should.eql(1, 'streams notifications');
        done();
      });
    });

    it('[5KNJ] must accept explicit null for optional fields', (done) => {
      const data = {
        parentId: null,
        clientData: null,
        trashed: null,
      };
      request.put(path(testData.streams[0].id)).send(data).end((res) => {
        validation.check(res, {
          status: 200,
          schema: methodsSchema.update.result,
        }, done);
      });
    });

    it('[0ANV] must add/update/remove the specified client data fields without touching the others',
      (done) => {
        const original = testData.streams[1];
        const data = {
          clientData: {
            booleanProp: true, // add
            stringProp: 'Where Art Thou?', // update
            numberProp: null, // delete
          },
        };

        request.put(path(original.id)).send(data).end((res) => {
          validation.check(res, {
            status: 200,
            schema: methodsSchema.update.result,
          });

          const expected = _.clone(original);
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

    it('[PL2G] must return a correct error if the stream does not exist', (done) => {
      request.put(path('unknown-id')).send({ name: '?' }).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });

    it('[JWT4] must return a correct error if the sent data is badly formatted', (done) => {
      request.put(path(testData.streams[1].id)).send({ badProperty: 'bad value' })
        .end((res) => {
          validation.checkErrorInvalidParams(res, done);
        });
    });

    it('[344I] must fail if a sibling stream with the same name already exists', (done) => {
      const update = { name: testData.streams[0].name };
      request.put(path(testData.streams[1].id)).send(update).end((res) => {
        validation.checkError(res, {
          status: 400,
          id: ErrorIds.ItemAlreadyExists,
          data: { name: update.name },
        }, done);
      });
    });

    it('[PT1E] must move the stream under the given parent when specified', (done) => {
      const original = testData.streams[0].children[1];
      const newParent = testData.streams[1];

      async.series([
        function updateStream(stepDone) {
          request.put(path(original.id)).send({ parentId: newParent.id })
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result,
              });
              streamsNotifCount.should.eql(1, 'streams notifications');
              stepDone();
            });
        },
        function verifyStreamsData(stepDone) {
          storage.find(user, {}, null, (err, streams) => {
            const updated = _.clone(original);
            updated.parentId = newParent.id;
            delete updated.modified;
            delete updated.modifiedBy;
            const expected = _.clone(newParent);
            expected.children = _.clone(newParent.children);
            expected.children.unshift(updated);
            const actual = _.find(streams, (stream) => stream.id === newParent.id);
            validation.checkObjectEquality(actual, expected);

            stepDone();
          });
        },
      ], done);
    });

    it('[HJBH] must return a correct error if the new parent stream is unknown', (done) => {
      request.put(path(testData.streams[1].id)).send({ parentId: 'unknown-id' })
        .end((res) => {
          validation.checkError(res, {
            status: 400,
            id: ErrorIds.UnknownReferencedResource,
            data: { parentId: 'unknown-id' },
          }, done);
        });
    });

    describe('forbidden updates of protected fields', () => {
      const streamId = 'forbidden_stream_update_test';
      const stream = {
        id: streamId,
        name: streamId,
      };

      beforeEach((done) => {
        request.post(basePath).send(stream).end((res) => {
          validation.check(res, {
            status: 201,
            schema: methodsSchema.create.result,
          }, done);
        });
      });

      it('[PN1H] must fail and throw a forbidden error in strict mode', (done) => {
        const forbiddenUpdate = {
          id: 'forbidden',
          children: [],
          created: 1,
          createdBy: 'bob',
          modified: 1,
          modifiedBy: 'alice',
        };

        async.series([
          function instanciateServerWithStrictMode(stepDone) {
            setIgnoreProtectedFieldUpdates(false, stepDone);
          },
          function testForbiddenUpdate(stepDone) {
            request.put(path(streamId)).send(forbiddenUpdate).end((res) => {
              validation.checkError(res, {
                status: 403,
                id: ErrorIds.Forbidden,
              }, stepDone);
            });
          },
        ], done);
      });

      it('[A3WC] must succeed by ignoring protected fields and log a warning in non-strict mode', (done) => {
        const forbiddenUpdate = {
          id: 'forbidden',
          children: [],
          created: 1,
          createdBy: 'bob',
          modified: 1,
          modifiedBy: 'alice',
        };

        async.series([
          function instanciateServerWithNonStrictMode(stepDone) {
            setIgnoreProtectedFieldUpdates(true, stepDone);
          },
          function testForbiddenUpdate(stepDone) {
            request.put(path(streamId)).send(forbiddenUpdate).end((res) => {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.update.result,
              });
              const { stream } = res.body;
              should(stream.id).not.be.equal(forbiddenUpdate.id);
              should(stream.created).not.be.equal(forbiddenUpdate.created);
              should(stream.createdBy).not.be.equal(forbiddenUpdate.createdBy);
              should(stream.modified).not.be.equal(forbiddenUpdate.modified);
              should(stream.modifiedBy).not.be.equal(forbiddenUpdate.modifiedBy);
              stepDone();
            });
          },
        ], done);
      });

      function setIgnoreProtectedFieldUpdates(activated, stepDone) {
        const settings = _.cloneDeep(helpers.dependencies.settings);
        settings.updates.ignoreProtectedFields = activated;
        server.ensureStarted.call(server, settings, stepDone);
      }
    });
  });

  describe('DELETE /<id>', function () {
    this.timeout(5000);

    beforeEach(resetData);

    it('[205A] must flag the specified stream as trashed', (done) => {
      const trashedId = testData.streams[0].id;
      let time;

      request.del(path(trashedId)).end((res) => {
        time = timestamp.now();
        validation.check(res, {
          status: 200,
          schema: methodsSchema.del.result,
        });

        const trashedStream = res.body.stream;
        trashedStream.trashed.should.eql(true);
        trashedStream.modified.should.be.within(time - 1, time);
        trashedStream.modifiedBy.should.eql(accessId);

        streamsNotifCount.should.eql(1, 'streams notifications');
        done();
      });
    });

    it('[TEFF] must delete the stream when already trashed with its descendants if there are no linked '
        + 'events', (done) => {
      const parent = testData.streams[2];
      const deletedStream = parent.children[1];
      const { id } = deletedStream;
      const childId = deletedStream.children[0].id;
      let expectedDeletion;
      let expectedChildDeletion;

      async.series([
        storage.updateOne.bind(storage, user, { id }, { trashed: true }), function deleteStream(stepDone) {
          request.del(path(id)).end((res) => {
            expectedDeletion = {
              id,
              deleted: timestamp.now(),
            };
            expectedChildDeletion = {
              id: childId,
              deleted: timestamp.now(),
            };

            validation.check(res, {
              status: 200,
              schema: methodsSchema.del.result,
            });
            streamsNotifCount.should.eql(1, 'streams notifications');
            stepDone();
          });
        },
        function verifyStreamData(stepDone) {
          storage.findAll(user, null, (err, streams) => {
            treeUtils.findById(streams, parent.id).children.length
              .should.eql(testData.streams[2].children.length - 1, 'child streams');

            const deletion = treeUtils.findById(streams, id);
            should.exist(deletion);
            validation.checkObjectEquality(deletion, expectedDeletion);

            const childDeletion = treeUtils.findById(streams, childId);
            should.exist(childDeletion);
            validation.checkObjectEquality(childDeletion, expectedChildDeletion);

            stepDone();
          });
        },
      ],
      done);
    });

    it('[LVTR] must return a correct error if there are linked events and the related parameter is '
        + 'missing', (done) => {
      const { id } = testData.streams[0];
      async.series([
        storage.updateOne.bind(storage, user, { id }, { trashed: true }), function deleteStream(stepDone) {
          request.del(path(testData.streams[0].id)).end((res) => {
            validation.checkError(res, {
              status: 400,
              id: ErrorIds.InvalidParametersFormat,
            }, stepDone);
          });
        },
      ],
      done);
    });

    it('[RKEU] must reject the deletion of a root stream with mergeEventsWithParent=true', (done) => {
      const { id } = testData.streams[0];
      async.series([
        storage.updateOne.bind(storage, user, { id }, { trashed: true }), function deleteStream(stepDone) {
          request.del(path(testData.streams[0].id)).query({ mergeEventsWithParent: true })
            .end((res) => {
              validation.checkError(res, {
                status: 400,
                id: ErrorIds.InvalidOperation,
                data: { streamId: id },
              }, stepDone);
            });
        },
      ],
      done);
    });

    it('[26V0] must reassign the linked events to the deleted stream\'s parent when specified', (done) => {
      const parentStream = testData.streams[0];
      const deletedStream = parentStream.children[1];

      async.series([
        storage.updateOne.bind(storage, user, { id: deletedStream.id }, { trashed: true }),
        function deleteStream(stepDone) {
          request.del(path(deletedStream.id)).query({ mergeEventsWithParent: true })
            .end((res) => {
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result,
              });

              streamsNotifCount.should.eql(1, 'streams notifications');
              eventsNotifCount.should.eql(1, 'events notifications');

              stepDone();
            });
        },
        function verifyLinkedEvents(stepDone) {
          eventsStorage.find(user, { streamIds: parentStream.id }, null, (err, linkedEvents) => {
            _.map(linkedEvents, 'id').should.eql([
              testData.events[4].id,
              testData.events[3].id,
              testData.events[2].id,
              testData.events[1].id,
            ]);

            stepDone();
          });
        },
      ],
      done);
    });

    it('[KLD8] must delete the linked events when mergeEventsWithParent is false', (done) => {
      const { id } = testData.streams[0].children[1];
      const deletedEvents = testData.events.filter((e) => {
        if (e.streamIds == null) return false;
        return e.streamIds[0] === id;
      });
      const deletedEventWithAtt = deletedEvents[0];
      let deletionTime;

      async.series([
        function addEventAttachment(stepDone) {
          request.post(`/${user.username}/events/${deletedEventWithAtt.id}`)
            .attach('image', testData.attachments.image.path,
              testData.attachments.image.fileName)
            .end((res) => {
              validation.check(res, { status: 200 });
              eventsNotifCount = 0; // reset
              stepDone();
            });
        },
        (step) => storage.updateOne(user, { id }, { trashed: true }, step),
        function deleteStream(stepDone) {
          request.del(path(id))
            .query({ mergeEventsWithParent: false })
            .end((res) => {
              deletionTime = timestamp.now();
              validation.check(res, {
                status: 200,
                schema: methodsSchema.del.result,
              });

              should(streamsNotifCount).eql(1, 'streams notifications');
              should(eventsNotifCount).eql(1, 'events notifications');

              stepDone();
            });
        },
        function verifyLinkedEvents(stepDone) {
          eventsStorage.findAll(user, null, (err, events) => {
            events.length.should.eql(testData.events.length, 'events');

            deletedEvents.forEach((e) => {
              const actual = _.find(events, { id: e.id });
              assert.approximately(
                actual.deleted, deletionTime, 2,
                'Deletion time must be correct.',
              );
              assert.equal(actual.id, e.id);
            });

            const dirPath = eventFilesStorage.getAttachedFilePath(user, deletedEventWithAtt.id);

            // some time after returning to the client. Let's hang around and try
            // this several times.
            assertEventuallyTrue(
              () => !fs.existsSync(dirPath),
              5, // second(s)
              `Event directory must be deleted${dirPath}`,
              stepDone,
            );
          });
        },
      ], done);

      function assertEventuallyTrue(property, maxWaitSeconds, msg, cb) {
        const deadline = new Date().getTime() + maxWaitSeconds;
        const checker = () => {
          if (new Date().getTime() > deadline) {
            return cb(new chai.AssertionError(`Timeout: ${msg}`));
          }

          const result = property();
          if (result) return cb();

          // assert: result is false, try again in a bit.
          setImmediate(checker);
        };

        // Launch first check
        setImmediate(checker);
      }
    });

    it('[1U1M] must return a correct error if the item is unknown', (done) => {
      request.del(path('unknown_id')).end((res) => {
        validation.checkError(res, {
          status: 404,
          id: ErrorIds.UnknownResource,
        }, done);
      });
    });
  });

  function resetData(done) {
    streamsNotifCount = 0;
    eventsNotifCount = 0;
    async.series([
      testData.resetStreams,
      testData.resetEvents,
    ], done);
  }
});
