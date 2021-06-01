/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, after, it */

require('./test-helpers'); 
const helpers = require('./helpers');
const treeUtils = require('utils').treeUtils;
const server = helpers.dependencies.instanceManager;
const async = require('async');
const fs = require('fs');
const path = require('path');
const validation = helpers.validation;
const testData = helpers.data;
const timestamp = require('unix-timestamp');
const _ = require('lodash');
const bluebird = require('bluebird');
const chai = require('chai');
const assert = chai.assert;

describe('Access permissions', function () {

  var user = Object.assign({}, testData.users[0]),
      request = null, // must be set after server instance started
      filesReadTokenSecret = helpers.dependencies.settings.auth.filesReadTokenSecret;

  function token(testAccessIndex) {
    return testData.accesses[testAccessIndex].token;
  }


  function getAllStreamIdsByToken(testAccessIndex) {
    var tokenStreamIds = [];
    testData.accesses[testAccessIndex].permissions.forEach(function (p) {
      tokenStreamIds.push(p.streamId);
    });
    return treeUtils.expandIds(testData.streams, tokenStreamIds);
  }

  function getAllTagsByToken(testAccessIndex) {
    return _.map(testData.accesses[testAccessIndex].permissions, 'tag');
  }

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) { request = helpers.request(server.url); stepDone(); }
    ], done);
  });

  describe('Events', function () {

    before(function (done) {
      async.series([
        testData.resetStreams,
        testData.resetAttachments
      ], done);
    });

    beforeEach(testData.resetEvents);

    var basePath = '/' + user.username + '/events';

    function reqPath(id) {
      return basePath + '/' + id;
    }

    it('[1AK1] `get` must only return events in accessible streams', function (done) {
      var params = {
        limit: 100, // i.e. all
        state: 'all'
      };
      var streamIds = getAllStreamIdsByToken(1);

      var events = validation.removeDeletionsAndHistory(testData.events).filter(function (e) {
        return streamIds.indexOf(e.streamIds[0]) >= 0;
      }).sort(function (a, b) {
        return b.time - a.time;
      });
      request.get(basePath, token(1)).query(params).end(function (res) {
        validation.checkFilesReadToken(res.body.events, testData.accesses[1],
          filesReadTokenSecret);
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(events);
        done();
      });
    });

    it('[NKI5] `get` must return all events when permissions are defined for "all streams" (*)',
      function (done) {
        var params = {
          limit: 100, // i.e. all
          state: 'all'
        }; 
        request.get(basePath, token(2)).query(params).end(function (res) {
          validation.checkFilesReadToken(res.body.events, testData.accesses[2],
            filesReadTokenSecret);
          validation.sanitizeEvents(res.body.events);
          res.body.events = validation.removeAccountStreamsEvents(res.body.events);
          res.body.events.should.eql(validation.removeDeletionsAndHistory(testData.events).sort(
            function (a, b) {
              return b.time - a.time;
            }
          ));
          done();
        });
      });

    it.skip('[FZ97] `get` must only return events with accessible tags', function (done) {
      var tags = getAllTagsByToken(5);
      var events = [];
      validation.removeDeletionsAndHistory(testData.events).sort(
        function (a, b) {
          return b.time - a.time;
        }).filter(function (e) {
          if (_.intersection(tags, e.tags).length > 0) {
            events.push(e);
          }
        });
      request.get(basePath, token(5)).end(function (res) {
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(events);
        done();
      });
    });

    it.skip('[1DH6] `get` must only return events in accessible streams *and* with accessible tags when both ' +
        'are defined', function (done) {
      request.get(basePath, token(6)).end(function (res) {
        validation.sanitizeEvents(res.body.events);
        res.body.events.should.eql(_.at(testData.events, 0));
        done();
      });
    });

    it('[5360] `get` (or any request) must alternatively accept the access token in the query string',
        function (done) {
      var query = {
        auth: token(1),
        streams: [testData.streams[2].children[0].id],
        state: 'all'
      };
      request.get(basePath, token(1)).unset('Authorization').query(query).end(function (res) {
        const expectedEvent = _.cloneDeep(testData.events[8]);
        expectedEvent.streamId = expectedEvent.streamIds[0];
        res.body.events.should.eql([expectedEvent]);
        done();
      });
    });

    it('[KTM1] must forbid getting an attached file if permissions are insufficient', function (done) {
      var event = testData.events[0],
          attachment = event.attachments[0];
      request.get(reqPath(event.id) + '/' + attachment.id, token(3)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[2773] must forbid creating events for \'read-only\' streams', function (done) {
      var params = {
        type: 'test/test',
        streamId: testData.streams[0].id
      };
      request.post(basePath, token(1)).send(params).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it.skip('[Y0TI] must forbid creating events for \'read-only\' tags', function (done) {
      var params = {
        type: 'test/test',
        streamId: testData.streams[0].id,
        tags: ['fragilistic']
      };
      request.post(basePath, token(5)).send(params).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[ZKZZ] must forbid updating events for \'read-only\' streams', function (done) {
      // also check recursive permissions
      request.put(reqPath(testData.events[0].id), token(1)).send({content: {}}).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it.skip('[9LKQ] must forbid updating events for \'read-only\' tags', function (done) {
      request.put(reqPath(testData.events[11].id), token(5)).send({content: {}})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it.skip('[RHFS] must forbid stopping events for \'read-only\' streams', function (done) {
      request.post(basePath + '/stop', token(2)).send({id: testData.events[9].id})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it.skip('[3SGZ] must forbid stopping events for \'read-only\' tags', function (done) {
      request.post(basePath + '/stop', token(5)).send({id: testData.events[11].id})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[4H62] must forbid deleting events for \'read-only\' streams', function (done) {
      request.del(reqPath(testData.events[1].id), token(1)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it.skip('[GBKV] must forbid deleting events for \'read-only\' tags', function (done) {
      request.del(reqPath(testData.events[11].id), token(5)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[Y38T] must allow creating events for \'contribute\' streams', function (done) {
      var data = {
        time: timestamp.now('-5h'),
        duration: timestamp.duration('1h'),
        type: 'test/test',
        streamId: testData.streams[1].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it.skip('[NIDD] must allow creating events for \'contribute\' tags', function (done) {
      var data = {
        type: 'test/test',
        streamId: testData.streams[1].id,
        tags: ['super']
      };
      request.post(basePath, token(5)).send(data).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });
  });

  describe('Streams', function () {

    before(testData.resetEvents);

    beforeEach(testData.resetStreams);

    var basePath = '/' + user.username + '/streams';

    function reqPath(id) {
      return basePath + '/' + id;
    }

    // note: personal (i.e. full) access is implicitly covered by streams/events tests

    it('[BSFP] `get` must only return streams for which permissions are defined', function (done) {
      request.get(basePath, token(1)).query({state: 'all'}).end(function (res) {
        res.body.streams.should.eql([
          // must not include inaccessible parentIds
          _.omit(testData.streams[0], 'parentId'),
          _.omit(testData.streams[1], 'parentId'),
          _.omit(testData.streams[2].children[0], 'parentId')
        ]);

        done();
      });
    });

    it('[R4IA] must forbid creating child streams in \'read-only\' streams', function (done) {
      var data = {
        name: 'Tai Ji',
        parentId: testData.streams[0].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[KHI7] must forbid creating child streams in \'contribute\' streams', function (done) {
      var data = {
        name: 'Xing Yi',
        parentId: testData.streams[1].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[MCDP] must forbid deleting child streams in \'contribute\' streams', function (done) {
      request.del(reqPath(testData.streams[1].children[0].id), token(1)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[7B6P] must forbid updating \'contribute\' streams', function (done) {
      request.put(reqPath(testData.streams[1].id), token(1)).send({name: 'Ba Gua'})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[RG5R] must forbid deleting \'contribute\' streams', function (done) {
      request.del(reqPath(testData.streams[1].id), token(1)).query({mergeEventsWithParent: true})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[O1AZ] must allow creating child streams in \'managed\' streams', function (done) {
      var data = {
        name: 'Dzogchen',
        parentId: testData.streams[2].children[0].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('[5QPU] must forbid moving streams into non-\'managed\' parent streams', function (done) {
      var update = {parentId: testData.streams[1].id};
      request.put(reqPath(testData.streams[2].children[0].id), token(1))
          .send(update).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[KP1Q] must allow deleting child streams in \'managed\' streams', function (done) {
      request.del(reqPath(testData.streams[2].children[0].children[0].id), token(1))
      .end(function (res) {
        res.statusCode.should.eql(200); // trashed -> considered an update
        done();
      });
    });

    it('[HHSS] must recursively apply permissions to the streams\' child streams', function (done) {
      var data = {
        name: 'Zen',
        parentId: testData.streams[0].children[0].id
      };
      request.post(basePath, token(1)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[NJ1A] must allow access to all streams when no specific stream permissions are defined',
        function (done) {
          request.get(basePath, token(2)).query({ state: 'all' }).end(function (res) {
            res.body.streams = validation.removeAccountStreams(res.body.streams);
            res.body.streams.should.eql(validation.removeDeletions(testData.streams));
            done();
      });
    });

    it.skip('[ZGK0] must allow access to all streams when only tag permissions are defined', function (done) {
      request.get(basePath, token(5)).query({state: 'all'}).end(function (res) {
        res.body.streams = validation.removeAccountStreams(res.body.streams);
        res.body.streams.should.eql(validation.removeDeletionsAndHistory(testData.streams));
        done();
      });
    });

    it.skip('[UYB2] must only allow access to set streams when both tag and stream permissions are defined',
        function (done) {
      request.get(basePath, token(6)).end(function (res) {
        res.body.streams.should.eql([_.omit(testData.streams[0], 'parentId')]);
        done();
      });
    });

  });

  describe('Auth and change tracking', function () {

    before(testData.resetStreams);

    beforeEach(testData.resetEvents);

    var basePath = '/' + user.username + '/events',
        sharedAccessIndex = 1,
        callerId = 'test-caller-id',
        auth = token(sharedAccessIndex) + ' ' + callerId;
    var newEventData = {
      type: 'test/test',
      streamId: testData.streams[1].id
    };

    it('[YE49] must handle optional caller id in auth (in addition to token)', function (done) {
      request.post(basePath, auth).send(newEventData).end(function (res) {
        res.statusCode.should.eql(201);
        var event = res.body.event,
            expectedAuthor = testData.accesses[sharedAccessIndex].id + ' ' + callerId;
        event.createdBy.should.eql(expectedAuthor);
        event.modifiedBy.should.eql(expectedAuthor);
        done();
      });
    });

    describe('custom auth step (e.g. to validate/parse caller id)', function () {

      var fileName = 'customAuthStepFn.js',
          srcPath = path.join(__dirname, 'permissions.fixtures', fileName),
          destPath = path.join(__dirname, '../../../../custom-extensions', fileName);

      before(function (done) {
        async.series([
          function setupCustomAuthStep(stepDone) {
            fs.readFile(srcPath, function (err, data) {
              if (err) 
                return stepDone(err);

              fs.writeFile(destPath, data, stepDone);
            });
          },
          server.restart.bind(server)
        ], function (err) {
          if (err) done(err);
          
          if (! fs.existsSync(destPath))
            throw new Error('Failed creating :' + destPath);

          done();
        });
      });

      after(function (done) {
        async.series([
          function teardownCustomAuthStep(stepDone) {
            fs.unlink(destPath, stepDone);
          },
          server.restart.bind(server)
        ], done);
      });

      it('[IA9K] must be supported and deny access when failing', function (done) {
        request.post(basePath, auth).send(newEventData).end(function (res) {
          validation.checkErrorInvalidAccess(res, done);
        });
      });

      it('[H58R] must allow access when successful', function (done) {
        var successAuth = token(sharedAccessIndex) + ' Georges (unparsed)';
        request.post(basePath, successAuth).send(newEventData).end(function (res) {
          res.statusCode.should.eql(201);
          var event = res.body.event,
              expectedAuthor = testData.accesses[sharedAccessIndex].id + ' Georges (parsed)';
          event.createdBy.should.eql(expectedAuthor);
          event.modifiedBy.should.eql(expectedAuthor);
          done();
        });
      });

      it('[H58Z] must allow access whith "callerid" headers', function (done) {
        var successAuth = token(sharedAccessIndex);
        const myRequest = helpers.unpatchedRequest(server.url);
        myRequest.execute('post', basePath, successAuth)
          .set('callerid', 'Georges (unparsed)')
          .send(newEventData).end(function (err, res) {
          res.statusCode.should.eql(201);
          var event = res.body.event,
              expectedAuthor = testData.accesses[sharedAccessIndex].id + ' Georges (parsed)';
          event.createdBy.should.eql(expectedAuthor);
          event.modifiedBy.should.eql(expectedAuthor);
          done();
        });
      });

      it('[ISE4] must fail properly (i.e. not granting access) when the custom function crashes', function (done) {
        var crashAuth = token(sharedAccessIndex) + ' Please Crash';
        request.post(basePath, crashAuth).send(newEventData).end(function (res) {
          res.statusCode.should.eql(500);
          done();
        });
      });

      it('[P4OM] must validate the custom function at startup time', async () => {
        const srcPath = path.join(__dirname, 'permissions.fixtures', 'customAuthStepFn.invalid.js');
        fs.writeFileSync(destPath, fs.readFileSync(srcPath)); // Copy content of srcPath file to destPath
        try {
          await bluebird.fromCallback(cb => {
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
