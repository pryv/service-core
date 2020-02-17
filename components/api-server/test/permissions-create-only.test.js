/*global describe, it, before, after */

const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

describe('permissions create-only level', () => {
  let mongoFixtures;
  before(async function() {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  after(() => {
    mongoFixtures.clean();
  });

  let username,
    streamParentId,
    streamInId,
    streamOutId,
    appAccessToken1,
    appAccessToken2,
    appAccessToken3,
    masterAppToken,
    eventInId,
    eventOutId;

  before(() => {
    username = cuid();
    appAccessToken1 = cuid();
    appAccessToken2 = cuid();
    appAccessToken3 = cuid();
    masterAppToken = cuid();
    streamParentId = cuid();
    streamInId = cuid();
    streamOutId = cuid();
    eventInId = cuid();
    eventOutId = cuid();
  });

  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  before(async () => {
    const user = await mongoFixtures.user(username, {});
    const streamParent = await user.stream({
      id: streamParentId,
      name: 'Does not matter at all'
    });
    const streamIn = await user.stream({
      parentId: streamParentId,
      id: streamInId,
      name: 'Does not matter',
      singleActivity: true
    });
    const streamOut = await user.stream({
      id: streamOutId,
      name: 'Does not matter either'
    });
    await user.access({
      type: 'app',
      token: appAccessToken1,
      permissions: [
        {
          streamId: streamInId,
          level: 'create-only'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: appAccessToken2,
      permissions: [
        {
          streamId: streamInId,
          level: 'create-only'
        },
        {
          streamId: streamParentId,
          level: 'read'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: appAccessToken3,
      permissions: [
        {
          streamId: streamInId,
          level: 'create-only'
        },
        {
          streamId: streamParentId,
          level: 'contribute'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: masterAppToken,
      permissions: [
        {
          streamId: '*',
          level: 'manage'
        },
      ]
    });
    await streamParent.event();
    await streamIn.event({
      id: eventInId,
      duration: null
    });
    await streamOut.event({
      id: eventOutId
    });
  });

  describe('Accesses', function () {
    let basePath;
    before(() => {
      basePath = `/${username}/accesses`;
    });

    it('[PC80] should allow to create accesses with "create-only" permissions for streams', async function () {
      const res = await server.request()
        .post(basePath)
        .set('Authorization', masterAppToken)
        .send({
          type: 'shared',
          name: 'whatever',
          permissions: [{
            streamId: streamInId,
            level: 'create-only',
          }]
        });
      const access = res.body.access;
      assert.exists(access);
    });

    it('[PC81] should forbid to create accesses with "create-only" permissions for tags', async function() {
      const res = await server
        .request()
        .post(basePath)
        .set('Authorization', masterAppToken)
        .send({
          type: 'shared',
          name: 'whatever',
          permissions: [
            {
              tag: 'whatever',
              level: 'create-only'
            }
          ]
        });
      const error = res.body.error;
      assert.exists(error);
      assert.equal(res.status, 403);
      assert.notExists(res.body.access);
    });
  });

  describe('Events', function() {
    let basePath;
    before(() => {
      basePath = `/${username}/events`;
    });

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    describe('GET /', function() {
      it('[PCO2] should return an empty list when reading "create-only" streams', async function() {
        const query = {
          streams: [streamInId]
        };

        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', appAccessToken1)
          .query(query);
        assert.equal(res.status, 200);
        assert.equal(res.body.events.length, 0);
      });

      it('[PC90] should return an empty list when reading "create-only" streams that are children of "read" streams', async function() {
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', appAccessToken2);
        const events = res.body.events;
        assert.equal(events.length, 1);
        const e = events[0];
        assert.equal(e.streamId, streamParentId);
      });

      it('[PC91] should return an empty list when reading "create-only" streams that are children of "contribute" streams', async function() {
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', appAccessToken3);
        const events = res.body.events;
        assert.equal(events.length, 1);
        const e = events[0];
        assert.equal(e.streamId, streamParentId);
      });
    });

    describe('POST /', function() {
      it('[PCO00] should forbid creating events for out of scope streams', async function() {
        const params = {
          type: 'test/test',
          streamId: streamOutId
        };

        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', appAccessToken1)
          .send(params);
        assert.equal(res.status, 403);
      });

      it('[PCO1] should allow creating events for "create-only" streams', async function() {
        const params = {
          type: 'test/test',
          streamId: streamInId
        };
        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', appAccessToken1)
          .send(params);
        assert.equal(res.status, 201);
      });
    });

    describe('PUT /', function () {
      it('[PCO3] should forbid updating events for "create-only" streams', async function () {
        const params = {
          content: 12
        };
        const res = await server
          .request()
          .put(reqPath(eventInId))
          .set('Authorization', appAccessToken1)
          .send(params);
        assert.equal(res.status, 403);
      });
    });
    
    describe('DELETE /', function () {
      it('[PCO4] should forbid deleting events for "create-only" streams', async function () {
        const res = await server
          .request()
          .del(reqPath(eventInId))
          .set('Authorization', appAccessToken1);
        assert.equal(res.status, 403);
      });
    });

    describe('POST /stop', function () {
      it('[PCO5] should allow stopping events for "create-only" streams', async function () {
        const res = await server
          .request()
          .post(`${basePath}/stop`)
          .set('Authorization', appAccessToken1)
          .send({ id: eventInId });
        assert.equal(res.status, 200);
        assert.exists(res.body.stoppedId);
      });
    });
    
  });

  describe('Streams', function() {
    let basePath;
    before(() => {
      basePath = `/${username}/streams`;
    });

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    describe('GET /', function () {
      it('[PCO6] should only return streams for which permissions are defined', async function () {
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', appAccessToken1)
          .query({ state: 'all' });
        const streams = res.body.streams;
        assert.equal(streams.length, 1);
        const stream = streams[0];
        assert.equal(stream.id, streamInId);
      });
    });

    describe('POST /', function () {
      it('[PCO7] should forbid creating child streams in "create-only" streams', async function () {
        const data = {
          name: 'Tai Ji',
          parentId: streamInId
        };
        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', appAccessToken1)
          .send(data);
        assert.equal(res.status, 403);
      });
    });

    describe('PUT /', function () {
      it('[PCO8] should forbid updating "create-only" streams', async function () {
        const res = await server
          .request()
          .put(reqPath(streamInId))
          .set('Authorization', appAccessToken1)
          .send({ name: 'Ba Gua' });
        assert.equal(res.status, 403);
      });
    });

    describe('DELETE /', function () {
      it('[PCO9] should forbid deleting "create-only" streams', async function () {
        const res = await server
          .request()
          .del(reqPath(streamInId))
          .set('Authorization', appAccessToken1);
        assert.equal(res.status, 403);
      });
    });

  });

});
