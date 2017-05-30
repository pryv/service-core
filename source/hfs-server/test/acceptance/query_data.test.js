'use strict';
// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it, afterEach */
const { settings, define, produceInfluxConnection, produceMongoConnection } = require('./test-helpers');
const databaseFixture = require('../support/database_fixture');
const request = require('supertest');
const should = require('should');
const timestamp = require('unix-timestamp');
const { ErrorIds } = require('../../../errors');
const cuid = require('cuid');
const R = require('ramda');
const bluebird = require('bluebird');

const Application = require('../../src/Application');

describe('Querying data from a HF series', function() {
  // Application, Context and Server are needed for influencing the way
  // authentication works in some of the tests here.
  const application = define(this, () => new Application().init(settings));
  const context = define(this, () => application().context);
  const server = define(this, () => application().server);

  // Express app that we test against.
  const app = define(this, () => server().setupExpress());

  const database = produceMongoConnection();
  const influx = produceInfluxConnection();

  const pryv = databaseFixture(database, this);
  afterEach(function () {
    pryv.clean();
  });

  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  const userId = define(this, cuid);
  const streamId = define(this, cuid);
  const eventId = define(this, cuid);
  const accessToken = define(this, cuid);

  define(this, () => {
    return pryv.user(userId(), {}, function (user) {
      user.stream({id: streamId()}, function (stream) {
        stream.event({
          id: eventId(),
          type: 'series:mass/kg'});
      });

      user.access({token: accessToken(), type: 'personal'});
      user.session(accessToken());
    });
  });

  function storeData(data: {}): Response {
    // Insert some data into the events series:
    const postData = {
      format: 'flatJSON',
      fields: Object.keys(data),
      points: [
        R.map(R.prop(R.__, data), Object.keys(data)),
      ]
    };
    return request(app())
      .post(`/${userId()}/events/${eventId()}/series`)
      .set('authorization', accessToken())
      .send(postData)
      .expect(200);
  }

  it.skip('should set the toTime parameter 1h after from time when ' +
    'fromTime is set, but toTime is not', function () {
    const startTime = timestamp.now();

    // TODO: implement fixtures for Influx

    return request(app())
      .get(`/${userId()}/events/${eventId()}/series`)
      .set('authorization', accessToken())
      .query({
        fromTime: startTime,
      })
      .expect(200)
      .then((res) => {
        should.exist(res.body.points);
        res.body.points.forEach((p) => {
          p[0].should.be.within(startTime, startTime + 3600);
        });
      });
  });

  it('should refuse a query for an unknown user', function () {
    return request(app())
      .get('/some-user/events/some-eventId/series')
      .set('authorization', 'someToken')
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.UnknownResource);
      });
  });

  it('should refuse a query missing the authorization token', function () {
    return request(app())
      .get(`/${userId()}/events/${eventId()}/series`)
      .expect(400)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.MissingHeader);
      });
  });

  it('should refuse a query containing an unauthorized token', function () {
    return request(app())
      .get(`/${userId()}/events/${eventId()}/series`)
      .set('authorization', 'invalid-auth')
      .expect(401)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.InvalidAccessToken);
      });
  });

  it('should return an unknown resource error when querying data ' +
    'for an nonexistent event id', function () {
    const nonexistentEventId = 'nonexistent-event-id';

    return request(app())
      .get(`/${userId()}/events/` + nonexistentEventId + '/series')
      .set('authorization', accessToken())
      .expect(404)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.UnknownResource);
        (res.body.error.message.indexOf('Unknown event')).should.be.aboveOrEqual(0);
      });
  });

  it('should return an unexpected error when querying for the ' +
    'event metadata fails', function () {
    context().metadata = {
      forSeries: function forSeries() {
        return bluebird.reject({error: 'main-storage-error'});
      }
    };

    return request(app())
      .get(`/${userId()}/events/${eventId()}/series`)
      .set('authorization', accessToken())
      .expect(500)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.UnexpectedError);
      });
  });

  it('should refuse a query containing parameters with the wrong format', function () {
    return request(app())
      .get(`/${userId()}/events/${eventId()}/series`)
      .set('authorization', accessToken())
      .query({
        fromTime: 'hi-i-am-not-a-timestamp',
        toTime: 'i-am-not-a-timestamp-either'
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        should.equal(err.id, ErrorIds.InvalidParametersFormat);
        should.equal(err.data[0].parameter, 'fromTime');
        should.equal(err.data[1].parameter, 'toTime');
      });
  });

  it('should refuse a query when toTime is before fromTime', function () {
    return request(app())
      .get(`/${userId()}/events/${eventId()}/series`)
      .set('authorization', accessToken())
      .query({
        fromTime: timestamp.now(),
        toTime: timestamp.now('-1h'),
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        should.equal(err.id, ErrorIds.InvalidParametersFormat);
        should.equal(err.data[0].message, 'Parameter fromTime is bigger than toTime');
      });
  });

});
