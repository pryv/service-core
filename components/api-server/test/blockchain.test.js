/*global describe, it, before, after */

var helpers = require('./helpers'),
  server = helpers.dependencies.instanceManager,
  async = require('async'),
  validation = helpers.validation,
  eventsMethodsSchema = require('../src/schema/eventsMethods'),
  should = require('should'),
  _ = require('lodash'),
  //storage = helpers.dependencies.storage.user.events,
  //timestamp = require('unix-timestamp'),
  testData = helpers.data;


describe('Blockchain', function () {

  var user = testData.users[0],
    request = null;

  function pathToEvent(eventId) {
    var resPath = '/' + user.username + '/events';
    if (eventId) {
      resPath += '/' + eventId;
    }
    return resPath;
  }

  before(function (done) {
    var settings = _.cloneDeep(helpers.dependencies.settings);
    settings.blockchain.events = true;
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      testData.resetStreams,
      testData.resetEvents,
      testData.resetAttachments,
      server.ensureStarted.bind(server, settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      }
    ], done);
  });

  // CRASHES ARE SERVER RESTART FOR SOME REASON
  after(function (done) {
    var settings = _.cloneDeep(helpers.dependencies.settings);
    settings.blockchain.events = false;
    server.ensureStarted.call(server, settings, done);
  });


  describe('blockchain.events is off', function () {

    before(function (done) {
      var settings = _.cloneDeep(helpers.dependencies.settings);
      settings.blockchain.events = false;
      server.ensureStarted.call(server, settings, done);
    });

    describe('GET', function () {


    });

    describe('CREATE', function () {

      it('should not return a blockchain field when the server setting is off', function (done) {
        request.post(pathToEvent(null)).send({
          streamId: testData.streams[0].id,
          type: 'note/txt',
          content: 'hi, delete me please'
        }).end(function (res) {
          validation.check(res, {
            status: 201,
            schema: eventsMethodsSchema.create.result
          });
          console.log('got: ', res.body);
          should.not.exist(res.body.blockchain);
          done();
        });
      });

    });

    describe('UPDATE', function () {

      it('should not return a blockchain field when the server setting is off', function () {

      });

    });

    describe('DELETE', function () {

      it('should not return a blockchain field when the server setting is off', function () {

      });

    });


  });

  describe('blockchain.events is on', function () {

    before(function (done) {
      var settings = _.cloneDeep(helpers.dependencies.settings);
      settings.blockchain.events = true;
      server.ensureStarted.call(server, settings, done);
    });

    describe('GET', function () {

    });

    describe('CREATE', function () {

      it('should return a blockchain field when the blockchain settings is on', function (done) {
        request.post(pathToEvent(null)).send({
          streamId: testData.streams[0].id,
          type: 'note/txt',
          content: 'hello, i am an event with blockchain return.'
        }).end(function (res) {
          validation.check(res, {
            status: 201,
            schema: eventsMethodsSchema.create.result
          });
          console.log('got: ', res.body);
          should.exist(res.body.blockchain);
          done();
        });
      });

    });

    describe('UPDATE', function () {

      it('should return a blockchain when the server setting is on', function () {

      });

    });

    describe('DELETE', function () {

      it('should return a blockchain when the server setting is on', function () {

      });

    });

  });
});