/*global describe, it, before*/
const helpers = require(__dirname + '/../../components/api-server/test/helpers'),
      testData = helpers.data,
      server = helpers.dependencies.instanceManager,
      timestamp = require('unix-timestamp'),
      _ = require('lodash'),
      async = require('async'),
      nock = require('nock'),
      should = require('should'),
      eventTypes = require('../../components/api-server/src/schema/event-types.default.json').types,
      errors = require('../../components/errors/src/ErrorIds');


describe('High-Frequency', function () {

  let user = testData.users[0],
      eventsPath = '/' + user.username + '/events',
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

    let type = 'position/wgs84',
        seriesEvent = {
          type: 'series:' + type,
          time: timestamp.now(),
          streamId: testData.streams[0].id
        };

    let points = [],
        baseTime = timestamp.now();

    for (let i=0; i<1000; i++) {
      points.push([baseTime + i, getBpm()]);
    }

    async.series([
      function createSeriesEvent(stepDone) {
        request.post(eventsPath).send(seriesEvent).end(function (res) {
          res.statusCode.should.eql(201);
          const event = res.body.event;
          should.exist(event);
          (_.isEqual(seriesEvent, _.pick(event, ['type', 'time', 'streamId']))).should.be.true();
          should.exist(event.content);
          event.content.elementType.should.eql(type);
          event.content.format.should.eql('flatJSON');
          event.content.points.should.eql([]);
          event.content.fields.should.eql(['timestamp'].concat(Object.keys(eventTypes[type].properties)));
          event.duration.should.eql(0);
          seriesEvent = event;
          stepDone();
        });
      },
      function retrievePoints(stepDone) {
        const params = {
          types: [seriesEvent.type]
        };
        request.get(eventsPath).query(params).end(function (res) {
          res.statusCode.should.eql(200);
          const event = res.body.events[0];
          event.content.should.eql(seriesEvent.content);
          stepDone();
        });
      }/*,
      function createPoints(stepDone) {
        nock(server.url)
          .post(eventsPath + '/' + seriesEvent.id + '/series', points)
          .reply(201, {
            points: points
          });
        request.post(eventsPath + '/' + seriesEvent.id + '/series').send(points).end(function (res) {
          res.statusCode.should.eql(201);
          should.exist(res.body.points);
          res.body.points.length.should.eql(1000);
          // TODO: test each point for content
          stepDone();
        });
      }*/
    ], done);

  });

  describe('POST /events', function () {

    it('must create an event of type series and return it', function (done) {
      const type = 'position/wgs84',
            seriesEvent = {
              type: 'series:' + type,
              time: timestamp.now(),
              streamId: testData.streams[0].id
            };
      request.post(eventsPath).send(seriesEvent).end(function (res) {
        res.statusCode.should.eql(201);
        const event = res.body.event;
        should.exist(event);
        (_.isEqual(seriesEvent, _.pick(event, ['type', 'time', 'streamId']))).should.be.true();
        should.exist(event.content);
        event.content.elementType.should.eql(type);
        event.content.format.should.eql('flatJSON');
        event.content.points.should.eql([]);
        event.content.fields.should.eql(['timestamp'].concat(Object.keys(eventTypes[type].properties)));
        event.duration.should.eql(0);
        done();
      });
    });

    it('must not allow events of type series containing an unknown type', function (done) {
      const invalidSeriesEvent = {
        type: 'series:unknown/type',
        time: timestamp.now(),
        streamId: testData.streams[0].id
      };

      request.post(eventsPath).send(invalidSeriesEvent).end(function (res) {
        res.statusCode.should.eql(400);
        const error = res.body.error;
        error.id.should.eql(errors.InvalidEventType);
        done();
      });
    });

  });


  describe('GET /events/{id}', function () {

    it('must retrieve an event of type series', function (done) {

      done();
    });

  });

  describe('GET /events/{id}/hf', function () {

    it('must return the points contained in the event of type series', function (done) {

      done();
    });
  });

});