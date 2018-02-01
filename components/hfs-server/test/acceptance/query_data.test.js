// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it, before, after */
const timestamp = require('unix-timestamp');
const { ErrorIds } = require('components/errors');
const cuid = require('cuid');
const bluebird = require('bluebird');
const chai = require('chai');
const assert = chai.assert; 

const { spawnContext, produceMongoConnection } = 
  require('./test-helpers');
const testHelpers = require('components/test-helpers');
const databaseFixture = testHelpers.databaseFixture;

describe('Querying data from a HF series', function() {
  const database = produceMongoConnection();
  
  const pryv = databaseFixture(database);
  after(function () {
    pryv.clean();
  });

  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  let userId, streamId, eventId, accessToken; 
  before(() => {
    userId = cuid(); 
    streamId = cuid(); 
    eventId = cuid(); 
    accessToken = cuid(); 
  });

  // Build the fixture
  before(() => {
    return pryv.user(userId, {}, function (user) {
      user.stream({id: streamId}, function (stream) {
        stream.event({
          id: eventId,
          type: 'series:mass/kg'});
      });

      user.access({token: accessToken, type: 'personal'});
      user.session(accessToken);
    });
  });
  
  // Now start a HFS server.
  let server; 
  before(async () => {
    server = await spawnContext.spawn(); 
  });
  after(() => {
    server.stop(); 
  });

  it('should refuse a query for an unknown user', function () {
    return server.request()
      .get('/some-user/events/some-eventId/series')
      .set('authorization', 'someToken')
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.UnknownResource);
      });
  });
  it('should refuse a query missing the authorization token', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .expect(400)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.MissingHeader);
      });
  });
  it('should refuse a query containing an unauthorized token', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', 'invalid-auth')
      .expect(401)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.InvalidAccessToken);
      });
  });
  it('should return an unknown resource error when querying data ' +
    'for an nonexistent event id', function () {
    const nonexistentEventId = 'nonexistent-event-id';

    return server.request()
      .get(`/${userId}/events/` + nonexistentEventId + '/series')
      .set('authorization', accessToken)
      .expect(404)
      .then((res) => {
        const error = res.body.error;
        assert.isNotNull(error);
        assert.strictEqual(error.id, ErrorIds.UnknownResource);
        assert.match(error.message, /Unknown event/);
      });
  });

  it('should refuse a query containing parameters with the wrong format', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .query({
        fromTime: 'hi-i-am-not-a-timestamp',
        toTime: 'i-am-not-a-timestamp-either'
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        assert.strictEqual(err.id, ErrorIds.InvalidParametersFormat);
        assert.strictEqual(err.data[0].parameter, 'fromTime');
        assert.strictEqual(err.data[1].parameter, 'toTime');
      });
  });

  it('should refuse a query when toTime is before fromTime', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .query({
        fromTime: timestamp.now(),
        toTime: timestamp.now('-1h'),
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        assert.strictEqual(err.id, ErrorIds.InvalidParametersFormat);
        assert.strictEqual(err.data[0].message, 'Parameter fromTime is bigger than toTime');
      });
  });

});
