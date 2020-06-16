/* global describe, before, beforeEach, after, it */

require('./test-helpers');
const helpers = require('./helpers');
const { treeUtils } = require('components/utils');

const server = helpers.dependencies.instanceManager;
const async = require('async');
const fs = require('fs');
const path = require('path');

const { validation } = helpers;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const bluebird = require('bluebird');
const chai = require('chai');

const { assert } = chai;

describe('Access permissions', () => {
  const user = testData.users[0];
  let request = null; // must be set after server instance started
  const { filesReadTokenSecret } = helpers.dependencies.settings.auth;

  function token(testAccessIndex) {
    return testData.accesses[testAccessIndex].token;
  }

  function getAllStreamIdsByToken(testAccessIndex) {
    const tokenStreamIds = [];
    testData.accesses[testAccessIndex].permissions.forEach((p) => {
      tokenStreamIds.push(p.streamId);
    });
    return treeUtils.expandIds(testData.streams, tokenStreamIds);
  }

  function getAllTagsByToken(testAccessIndex) {
    return _.map(testData.accesses[testAccessIndex].permissions, 'tag');
  }

  before((done) => {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); },
    ], done);
  });

  describe('Events', () => {
    before((done) => {
      async.series([
        testData.resetStreams,
        testData.resetAttachments,
      ], done);
    });

    beforeEach(testData.resetEvents);

    const basePath = `/${user.username}/events`;

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    it('[1AK1] `get` must only return events in accessible streams', (done) => {
      const params = {
        limit: 100, // i.e. all
        state: 'all',
      };
      const streamIds = getAllStreamIdsByToken(1);

      const events = validation.removeDeletionsAndHistory(testData.events).filter((e) => streamIds.indexOf(e.streamIds[0]) >= 0).sort((a, b) => b.time - a.time);
      request.get(basePath, token(1)).query(params).end((res) => {
        validation.checkFilesReadToken(res.body.events, testData.accesses[1],
          filesReadTokenSecret);
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(events);
        done();
      });
    });

    it('[NKI5] `get` must return all events when permissions are defined for "all streams" (*)',
      (done) => {
        const params = {
          limit: 100, // i.e. all
          state: 'all',
        };
        request.get(basePath, token(2)).query(params).end((res) => {
          validation.checkFilesReadToken(res.body.events, testData.accesses[2],
            filesReadTokenSecret);
          validation.sanitizeEvents(res.body.events);
          res.body.events.should.eql(validation.removeDeletionsAndHistory(testData.events).sort(
            (a, b) => b.time - a.time,
          ));
          done();
        });
      });

    it('[FZ97] `get` must only return events with accessible tags', (done) => {
      const tags = getAllTagsByToken(5);
      const events = [];
      validation.removeDeletionsAndHistory(testData.events).sort(
        (a, b) => b.time - a.time,
      ).filter((e) => {
        if (_.intersection(tags, e.tags).length > 0) {
          events.push(e);
        }
      });
      request.get(basePath, token(5)).end((res) => {
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(events);
        done();
      });
    });

    it('[1DH6] `get` must only return events in accessible streams *and* with accessible tags when both '
        + 'are defined', (done) => {
      request.get(basePath, token(6)).end((res) => {
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(_.at(testData.events, 0));
        done();
      });
    });

    it('[5360] `get` (or any request) must alternatively accept the access token in the query string',
      (done) => {
        const query = {
          auth: token(1),
          streams: [testData.streams[2].children[0].id],
          state: 'all',
        };
        request.get(basePath, token(1)).unset('Authorization').query(query).end((res) => {
          const expectedEvent = _.cloneDeep(testData.events[8]);
          expectedEvent.streamId = expectedEvent.streamIds[0];
          res.body.events.should.eql([expectedEvent]);
          done();
        });
      });

    it('[KTM1] must forbid getting an attached file if permissions are insufficient', (done) => {
      const event = testData.events[0];
      const attachment = event.attachments[0];
      request.get(`${reqPath(event.id)}/${attachment.id}`, token(3)).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[2773] must forbid creating events for \'read-only\' streams', (done) => {
      const params = {
        type: 'test/test',
        streamId: testData.streams[0].id,
      };
      request.post(basePath, token(1)).send(params).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[Y0TI] must forbid creating events for \'read-only\' tags', (done) => {
      const params = {
        type: 'test/test',
        streamId: testData.streams[0].id,
        tags: ['fragilistic'],
      };
      request.post(basePath, token(5)).send(params).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[ZKZZ] must forbid updating events for \'read-only\' streams', (done) => {
      // also check recursive permissions
      request.put(reqPath(testData.events[0].id), token(1)).send({ content: {} }).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[9LKQ] must forbid updating events for \'read-only\' tags', (done) => {
      request.put(reqPath(testData.events[11].id), token(5)).send({ content: {} })
        .end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });

    it.skip('[RHFS] must forbid stopping events for \'read-only\' streams', (done) => {
      request.post(`${basePath}/stop`, token(2)).send({ id: testData.events[9].id })
        .end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });

    it.skip('[3SGZ] must forbid stopping events for \'read-only\' tags', (done) => {
      request.post(`${basePath}/stop`, token(5)).send({ id: testData.events[11].id })
        .end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });

    it('[4H62] must forbid deleting events for \'read-only\' streams', (done) => {
      request.del(reqPath(testData.events[1].id), token(1)).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[GBKV] must forbid deleting events for \'read-only\' tags', (done) => {
      request.del(reqPath(testData.events[11].id), token(5)).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[Y38T] must allow creating events for \'contribute\' streams', (done) => {
      const data = {
        time: timestamp.now('-5h'),
        duration: timestamp.duration('1h'),
        type: 'test/test',
        streamId: testData.streams[1].id,
      };
      request.post(basePath, token(1)).send(data).end((res) => {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('[NIDD] must allow creating events for \'contribute\' tags', (done) => {
      const data = {
        type: 'test/test',
        streamId: testData.streams[1].id,
        tags: ['super'],
      };
      request.post(basePath, token(5)).send(data).end((res) => {
        res.statusCode.should.eql(201);
        done();
      });
    });
  });

  describe('Streams', () => {
    before(testData.resetEvents);

    beforeEach(testData.resetStreams);

    const basePath = `/${user.username}/streams`;

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    // note: personal (i.e. full) access is implicitly covered by streams/events tests

    it('[BSFP] `get` must only return streams for which permissions are defined', (done) => {
      request.get(basePath, token(1)).query({ state: 'all' }).end((res) => {
        res.body.streams.should.eql([
          // must not include inaccessible parentIds
          _.omit(testData.streams[0], 'parentId'),
          _.omit(testData.streams[1], 'parentId'),
          _.omit(testData.streams[2].children[0], 'parentId'),
        ]);

        done();
      });
    });

    it('[R4IA] must forbid creating child streams in \'read-only\' streams', (done) => {
      const data = {
        name: 'Tai Ji',
        parentId: testData.streams[0].id,
      };
      request.post(basePath, token(1)).send(data).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[KHI7] must forbid creating child streams in \'contribute\' streams', (done) => {
      const data = {
        name: 'Xing Yi',
        parentId: testData.streams[1].id,
      };
      request.post(basePath, token(1)).send(data).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[MCDP] must forbid deleting child streams in \'contribute\' streams', (done) => {
      request.del(reqPath(testData.streams[1].children[0].id), token(1)).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[7B6P] must forbid updating \'contribute\' streams', (done) => {
      request.put(reqPath(testData.streams[1].id), token(1)).send({ name: 'Ba Gua' })
        .end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });

    it('[RG5R] must forbid deleting \'contribute\' streams', (done) => {
      request.del(reqPath(testData.streams[1].id), token(1)).query({ mergeEventsWithParent: true })
        .end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });

    it('[O1AZ] must allow creating child streams in \'managed\' streams', (done) => {
      const data = {
        name: 'Dzogchen',
        parentId: testData.streams[2].children[0].id,
      };
      request.post(basePath, token(1)).send(data).end((res) => {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('[5QPU] must forbid moving streams into non-\'managed\' parent streams', (done) => {
      const update = { parentId: testData.streams[1].id };
      request.put(reqPath(testData.streams[2].children[0].id), token(1))
        .send(update).end((res) => {
          validation.checkErrorForbidden(res, done);
        });
    });

    it('[KP1Q] must allow deleting child streams in \'managed\' streams', (done) => {
      request.del(reqPath(testData.streams[2].children[0].children[0].id), token(1))
        .end((res) => {
          res.statusCode.should.eql(200); // trashed -> considered an update
          done();
        });
    });

    it('[HHSS] must recursively apply permissions to the streams\' child streams', (done) => {
      const data = {
        name: 'Zen',
        parentId: testData.streams[0].children[0].id,
      };
      request.post(basePath, token(1)).send(data).end((res) => {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[NJ1A] must allow access to all streams when no specific stream permissions are defined',
      (done) => {
        request.get(basePath, token(2)).query({ state: 'all' }).end((res) => {
          res.body.streams.should.eql(validation.removeDeletions(testData.streams));
          done();
        });
      });

    it('[ZGK0] must allow access to all streams when only tag permissions are defined', (done) => {
      request.get(basePath, token(5)).query({ state: 'all' }).end((res) => {
        res.body.streams.should.eql(validation.removeDeletionsAndHistory(testData.streams));
        done();
      });
    });

    it('[UYB2] must only allow access to set streams when both tag and stream permissions are defined',
      (done) => {
        request.get(basePath, token(6)).end((res) => {
          res.body.streams.should.eql([_.omit(testData.streams[0], 'parentId')]);
          done();
        });
      });
  });

  describe('Auth and change tracking', () => {
    before(testData.resetStreams);

    beforeEach(testData.resetEvents);

    const basePath = `/${user.username}/events`;
    const sharedAccessIndex = 1;
    const callerId = 'test-caller-id';
    const auth = `${token(sharedAccessIndex)} ${callerId}`;
    const newEventData = {
      type: 'test/test',
      streamId: testData.streams[1].id,
    };

    it('[YE49] must handle optional caller id in auth (in addition to token)', (done) => {
      request.post(basePath, auth).send(newEventData).end((res) => {
        res.statusCode.should.eql(201);
        const { event } = res.body;
        const expectedAuthor = `${testData.accesses[sharedAccessIndex].id} ${callerId}`;
        event.createdBy.should.eql(expectedAuthor);
        event.modifiedBy.should.eql(expectedAuthor);
        done();
      });
    });

    describe('custom auth step (e.g. to validate/parse caller id)', () => {
      const fileName = 'customAuthStepFn.js';
      const srcPath = path.join(__dirname, 'permissions.fixtures', fileName);
      const destPath = path.join(__dirname, '../../../../custom-extensions', fileName);

      before((done) => {
        async.series([
          function setupCustomAuthStep(stepDone) {
            fs.readFile(srcPath, (err, data) => {
              if (err) { return stepDone(err); }

              fs.writeFile(destPath, data, stepDone);
            });
          },
          server.restart.bind(server),
        ], (err) => {
          if (err) done(err);

          if (!fs.existsSync(destPath)) throw new Error(`Failed creating :${destPath}`);

          done();
        });
      });

      after((done) => {
        async.series([
          function teardownCustomAuthStep(stepDone) {
            fs.unlink(destPath, stepDone);
          },
          server.restart.bind(server),
        ], done);
      });

      it('[IA9K] must be supported and deny access when failing', (done) => {
        request.post(basePath, auth).send(newEventData).end((res) => {
          validation.checkErrorInvalidAccess(res, done);
        });
      });

      it('[H58R] must allow access when successful', (done) => {
        const successAuth = `${token(sharedAccessIndex)} Georges (unparsed)`;
        request.post(basePath, successAuth).send(newEventData).end((res) => {
          res.statusCode.should.eql(201);
          const { event } = res.body;
          const expectedAuthor = `${testData.accesses[sharedAccessIndex].id} Georges (parsed)`;
          event.createdBy.should.eql(expectedAuthor);
          event.modifiedBy.should.eql(expectedAuthor);
          done();
        });
      });

      it('[ISE4] must fail properly (i.e. not granting access) when the custom function crashes', (done) => {
        const crashAuth = `${token(sharedAccessIndex)} Please Crash`;
        request.post(basePath, crashAuth).send(newEventData).end((res) => {
          res.statusCode.should.eql(500);
          done();
        });
      });

      it('[P4OM] must validate the custom function at startup time', async () => {
        const srcPath = path.join(__dirname, 'permissions.fixtures', 'customAuthStepFn.invalid.js');
        fs.writeFileSync(destPath, fs.readFileSync(srcPath)); // Copy content of srcPath file to destPath
        try {
          await bluebird.fromCallback((cb) => {
            server.restart.call(server, cb);
          });
        } catch (error) {
          assert.isNotNull(error);
          assert.exists(error.message);
          assert.match(error.message, /Server failed/);
        }
      });
    });
  });
});
