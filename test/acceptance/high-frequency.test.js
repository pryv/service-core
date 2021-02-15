/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, it, before*/
const helpers = require(__dirname + '/../../dist/components/api-server/test/helpers'),
      testData = helpers.data,
      server = helpers.dependencies.instanceManager,
      timestamp = require('unix-timestamp'),
      _ = require('lodash'),
      async = require('async'),
      should = require('should'),
      errors = require('../../dist/components/errors/src/ErrorIds');


describe('High-Frequency', function () {

  let user = Object.assign({}, testData.users[0]),
      eventsPath = '/' + user.username + '/events',
      request = null; // must be set after server started

  before(function (done) {
    async.series([
      testData.resetUsers,
      testData.resetEvents,
      testData.resetAccesses,
      testData.resetProfile,
      testData.resetFollowedSlices,
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

    it('must create an event of type series and return it with ' +
      'the right content.fields', function (done) {
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
        event.content.fields.should.eql([
          'timestamp', 'latitude', 'longitude',
          'altitude', 'horizontalAccuracy', 'verticalAccuracy', 
          'speed', 'bearing']); 
        event.duration.should.eql(0);
        done();
      });
    });

    it('must create an event of type series and return it with ' +
      'the content.field value for a numerical value', function (done) {
      const type = 'energy/j',
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
        event.content.fields.should.eql(['timestamp','value']);
        event.duration.should.eql(0);
        done();
      });
    });

    it('must create an event of type series and return it with ' +
      'the content.field value for a string value', function (done) {
      const type = 'mood/emoticon',
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
        event.content.fields.should.eql(['timestamp','value']);
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