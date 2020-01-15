// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it, before, after */
const timestamp = require('unix-timestamp');
const { ErrorIds } = require('components/errors');
const cuid = require('cuid');
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

  it('[Q1X1] should should accept a query with authentication token header', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .expect(200);
  });

  // Fixes #210
  it('[Q1X2] should should accept a query with authentication token in url parameter', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series?auth=` + accessToken)
      .expect(200);
  });
  it('[I2ZH] should refuse a query for an unknown user', function () {
    return server.request()
      .get('/some-user/events/some-eventId/series')
      .set('authorization', 'someToken')
      .expect(404)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.UnknownResource);
      });
  });
  it('[EYCA] should refuse a query missing the authorization token', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .expect(401)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.MissingHeader);
      });
  });
  it('[OINY] should refuse a query containing an unauthorized token', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', 'invalid-auth')
      .expect(403)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.InvalidAccessToken);
      });
  });
  it('[Q991] should return an unknown resource error when querying data ' +
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

  it('[QMC7] should refuse a query containing parameters with the wrong format', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .query({
        fromDeltaTime: 'hi-i-am-not-a-deltaTime',
        toDeltaTime: 'i-am-not-a-deltaTime-either'
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        assert.strictEqual(err.id, ErrorIds.InvalidParametersFormat);
      });
  });
  it('[HGVV] should refuse a query when toTime is before fromTime', function () {
    return server.request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .query({
        fromDeltaTime: 1000,
        toDeltaTime: 200,
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        assert.strictEqual(err.id, ErrorIds.InvalidParametersFormat);
      });
  });

});
