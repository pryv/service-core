/*global describe, it, before*/
var helpers = require(__dirname + '/../../components/api-server/test/helpers'),
    testData = helpers.data,
    server = helpers.dependencies.instanceManager,
    timestamp = require('unix-timestamp'),
    _ = require('lodash'),
    async = require('async'),
    nock = require('nock');


describe('High-Frequency', function () {

  var user = testData.users[0],
      apiServerPath = '/' + user.username + '/events',
      seriesServerPath = '/' + user.username + '/events',
      request = null; // must be set after server started

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetAccesses,
      testData.resetProfile,
      testData.resetFollowedSlices,
      testData.resetEvents,
      testData.resetStreams,
      testData.resetAttachments,
      server.ensureStarted.bind(server, helpers.dependencies.settings),
      function (stepDone) {
        request = helpers.request(server.url);
        request.login(user, stepDone);
      }
    ], done);
  });

  it('must create a series holder event', function (done) {

    function getBpm() {
      return Math.floor(80 * (40 * Math.random()));
    }

    var type = 'frequency/bpm',
        seriesEvent = {
          type: 'series:' + type,
          time: timestamp.now(),
          streamId: testData.streams[0].id // content should be not allowed at creation, right?
        };

    var points = [],
        baseTime = timestamp.now();

    for (var i=0; i<1000; i++) {
      points.push([baseTime + i, getBpm()]);
    }

    var postSeries = nock(seriesServerPath)
                      .post('/' + seriesEvent.id + '/series', points)
                      .reply(201, {
                        points: points
                      });
    async.series([
      /*function createSeriesEvent(stepDone) {
        request.post(apiServerPath).send(seriesEvent).end(function (res) {
          console.log('body', res.body);
          res.statusCode.should.eql(201);
          var event = res.body.event;
          event.should.exist();

          (_.isEqual(seriesEvent, _.pick(event, ['type', 'time', 'streamId']))).should.be.true();
          event.duration.should.eql(0);
          event.content.should.exist();

          seriesEvent = event;
          stepDone();
        });
      },*/
      function createPoints(stepDone) {
        request.post(seriesServerPath + '/' + seriesEvent.id + '/series').send(points).end(function (res) {
          res.statusCode.should.eql(201);
          res.body.points.should.exist();
          res.body.points.length.should.eql(1000);
          // TODO: test each point for content
          stepDone();
        });
      },
      function retrievePoints(stepDone) {
        request.get(apiServerPath + '/' + seriesEvent.id + '/series').end(function (res) {
          res.statusCode.should.eql(200);
          var event = res.body.event;
          event.content.should.eql(points);
          stepDone();
        });
      }
    ], done);




  });

});