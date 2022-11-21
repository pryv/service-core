/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// Tests pertaining to storing data in a hf series.

/* global describe, it, before, after */
const timestamp = require('unix-timestamp');
const { ErrorIds } = require('errors');
const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;
const URL = require('url');
const superagent = require('superagent');

const { spawnContext, produceMongoConnection } = require('./test-helpers');
const testHelpers = require('test-helpers');
const databaseFixture = testHelpers.databaseFixture;

describe('Querying data from a HF series', function () {
  let database, pryv;
  before(async function () {
    database = await produceMongoConnection();
    pryv = databaseFixture(database);
  });

  after(function () {
    pryv.clean();
  });

  // Set up a few ids that we'll use for testing. NOTE that these ids will
  // change on every test run.
  let userId,
    streamId,
    streamId2,
    eventId,
    accessToken,
    createOnlyToken,
    secondStreamToken;
  before(() => {
    userId = cuid();
    streamId = cuid();
    streamId2 = cuid();
    eventId = cuid();
    accessToken = cuid();
    createOnlyToken = cuid();
    secondStreamToken = cuid();
  });

  // Build the fixture
  before(async () => {
    const user = await pryv.user(userId, {});
    await user.stream({ id: streamId });
    await user.stream({ id: streamId2 });
    await user.event({
      id: eventId,
      type: 'series:mass/kg',
      streamIds: [streamId, streamId2],
    });

    await user.access({ token: accessToken, type: 'personal' });
    await user.session(accessToken);
    await user.access({
      token: createOnlyToken,
      type: 'app',
      permissions: [
        {
          streamId: streamId,
          level: 'create-only',
        },
      ],
    });
    await user.access({
      token: secondStreamToken,
      type: 'app',
      permissions: [
        {
          streamId: streamId2,
          level: 'read',
        },
      ],
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
    return server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .expect(200);
  });

  // Fixes #210
  it('[Q1X2] should accept a query with authentication token in url parameter', function () {
    return server
      .request()
      .get(`/${userId}/events/${eventId}/series?auth=` + accessToken)
      .expect(200);
  });
  it('[Q1X3] must accept basic auth schema', async function () {
    const url = new URL.URL(server.baseUrl);
    const basicAuthUrl = url.href.replace(
      url.hostname,
      accessToken + '@' + url.hostname
    );
    const apiEndPointUrl = URL.resolve(
      basicAuthUrl,
      userId + '/events/' + eventId + '/series'
    );
    const res = await superagent.get(apiEndPointUrl);
    assert.equal(res.status, 200);
  });

  // Fixes #212
  it('[RAIJ] should return core-metadata in every call', async function () {
    const res = await server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken);

    chai.expect(res).to.have.property('status').that.eql(200);
    chai.expect(res.body).to.have.property('meta');
  });

  it("[XAI2] should accept a query when the authorized permission is on the event's 2nd streamId", async function () {
    const res = await server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', secondStreamToken);

    chai.expect(res).to.have.property('status').that.eql(200);
  });

  it('[I2ZH] should refuse a query for an unknown user', function () {
    return server
      .request()
      .get('/some-user/events/some-eventId/series')
      .set('authorization', 'someToken')
      .expect(404)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.UnknownResource);
      });
  });
  it('[EYCA] should refuse a query missing the authorization token', function () {
    return server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .expect(401)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.MissingHeader);
      });
  });
  it('[OINY] should refuse a query containing an unauthorized token', function () {
    return server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', 'invalid-auth')
      .expect(403)
      .then((res) => {
        assert.isNotNull(res.body.error);
        assert.strictEqual(res.body.error.id, ErrorIds.InvalidAccessToken);
      });
  });
  it(
    '[Q991] should return an unknown resource error when querying data ' +
      'for an nonexistent event id',
    function () {
      const nonexistentEventId = 'nonexistent-event-id';

      return server
        .request()
        .get(`/${userId}/events/` + nonexistentEventId + '/series')
        .set('authorization', accessToken)
        .expect(404)
        .then((res) => {
          const error = res.body.error;
          assert.isNotNull(error);
          assert.strictEqual(error.id, ErrorIds.UnknownResource);
          assert.match(error.message, /Unknown event/);
        });
    }
  );

  it('[QMC7] should refuse a query containing parameters with the wrong format', function () {
    return server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', accessToken)
      .query({
        fromDeltaTime: 'hi-i-am-not-a-deltaTime',
        toDeltaTime: 'i-am-not-a-deltaTime-either',
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        assert.strictEqual(err.id, ErrorIds.InvalidParametersFormat);
      });
  });
  it('[HGVV] should refuse a query when toTime is before fromTime', function () {
    return server
      .request()
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

  it('[XI4M] should refuse a query with a "create-only" token', async function () {
    const res = await server
      .request()
      .get(`/${userId}/events/${eventId}/series`)
      .set('authorization', createOnlyToken)
      .query({
        fromDeltaTime: 0,
        toDeltaTime: 100,
      });
    assert.equal(res.status, 403);
  });
});
