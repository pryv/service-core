/*global describe, before, beforeEach, after, it */

require('./test-helpers'); 
const helpers = require('./helpers');
const treeUtils = require('components/utils').treeUtils;
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

  var user = testData.users[0],
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

    it('[PCO0] must forbid creating events for out of scope streams', function (done) {
      var params = {
        type: 'test/test',
        streamId: testData.streams[0].id
      };

      request.post(basePath, token(8)).send(params).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[PCO1] must allow creating events for \'create-only\' streams', function (done) {
      var params = {
        type: 'test/test',
        streamId: testData.streams[9].id
      };
      request.post(basePath, token(8)).send(params).end(function (res) {
        res.statusCode.should.eql(201);
        done();
      });
    });

    it('[PCO2] must return an empty list when reading \'create-only\' streams', function (done) {
      var query = {
        streams: [testData.streams[9].id]
      };

      request.get(basePath, token(8)).query(query).end(function (res) {
        res.statusCode.should.eql(200);
        res.body.events.should.eql([]);
        done();
      });
    });

    it('must see what happens when read in stream and c-o in child');
    it('must see what happens when contribute in stream and c-o in child');

    it('[PCO3] must forbid updating events for \'create-only\' streams', function (done) {
      var params = {
        content: 12
      };
      request.put(reqPath(testData.events[28].id), token(8)).send(params).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[PCO4] must forbid deleting events for \'create-only\' streams', function (done) {
      request.del(reqPath(testData.events[28].id), token(8)).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });


    it('[PCO5] must forbid stopping events for \'create-only\' streams', function (done) {
      request.post(basePath + '/stop', token(8)).send({id: testData.events[28].id})
          .end(function (res) {
            res.statusCode.should.eql(200);
            assert.exists(res.body.stoppedId);
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

    it('[PCO6] `get` must only return streams for which permissions are defined', function (done) {
      request.get(basePath, token(8)).query({state: 'all'}).end(function (res) {
        res.body.streams.should.eql([
          _.omit(testData.streams[9], 'parentId')
        ]);

        done();
      });
    });

    it('[PCO7] must forbid creating child streams in \'create-only\' streams', function (done) {
      var data = {
        name: 'Tai Ji',
        parentId: testData.streams[9].id
      };
      request.post(basePath, token(8)).send(data).end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[PCO8] must forbid updating \'create-only\' streams', function (done) {
      request.put(reqPath(testData.streams[8].id), token(8)).send({name: 'Ba Gua'})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

    it('[PCO9] must forbid deleting \'create-only\' streams', function (done) {
      request.del(reqPath(testData.streams[8].id), token(8)).query({mergeEventsWithParent: true})
          .end(function (res) {
        validation.checkErrorForbidden(res, done);
      });
    });

  });
  
});
