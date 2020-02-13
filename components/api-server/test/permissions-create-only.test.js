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
    appAccessId1,
    appAccessToken1,
    appAccessId2,
    appAccessToken2,
    appAccessId3,
    appAccessToken3,
    eventInId,
    eventOutId;

  before(() => {
    username = cuid();
    appAccessToken1 = cuid();
    appAccessId1 = cuid();
    appAccessToken2 = cuid();
    appAccessId2 = cuid();
    appAccessToken3 = cuid();
    appAccessId3 = cuid();
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

  before(() => {
    return mongoFixtures.user(username, {}, async user => {
      await user.stream({
        id: streamParentId,
        name: 'Does not matter at all',
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
        id: appAccessId1,
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
        id: appAccessId2,
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
        id: appAccessId3,
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
      await streamIn.event({
        id: eventInId,
        duration: null
      });
      await streamOut.event({
        id: eventOutId
      });
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

    it('must see what happens when read in stream and c-o in child', async function() {
      // 1 fois sur 2 403, l'autre vide
      const res = await server
        .request()
        .get(basePath)
        .set('Authorization', appAccessToken2);
      console.log('got', res.body);
    });

    it('must see what happens when contribute in stream and c-o in child', async function() {
      // pareil
      const res = await server
        .request()
        .get(basePath)
        .set('Authorization', appAccessToken3);
      console.log('got', res.body);
    });

    it('[PCO0X] must forbid creating events for out of scope streams', async function() {
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

    it("[PCO1] must allow creating events for 'create-only' streams", async function() {
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

    it("[PCO2] must return an empty list when reading 'create-only' streams", async function() {
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

    it("[PCO3] must forbid updating events for 'create-only' streams", async function() {
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

    it("[PCO4] must forbid deleting events for 'create-only' streams", async function() {
      const res = await server
        .request()
        .del(reqPath(eventInId))
        .set('Authorization', appAccessToken1);
      assert.equal(res.status, 403);
    });

    it("[PCO5] must allow stopping events for 'create-only' streams", async function() {
      const res = await server
        .request()
        .post(`${basePath}/stop`)
        .set('Authorization', appAccessToken1)
        .send({ id: eventInId });
      assert.equal(res.status, 200);
      assert.exists(res.body.stoppedId);
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

    // note: personal (i.e. full) access is implicitly covered by streams/events tests

    it('[PCO6] `get` must only return streams for which permissions are defined', async function() {
      const res = await server
        .request()
        .get(basePath)
        .set('Authorization', appAccessToken1)
        .query({ state: 'all' });
      const stream = res.body.streams[0];
      assert.equal(stream.id, streamInId);
    });

    it("[PCO7] must forbid creating child streams in 'create-only' streams", async function() {
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

    it("[PCO8] must forbid updating 'create-only' streams", async function() {
      const res = await server
        .request()
        .put(reqPath(streamInId))
        .set('Authorization', appAccessToken1)
        .send({ name: 'Ba Gua' });
      assert.equal(res.status, 403);
    });

    it("[PCO9] must forbid deleting 'create-only' streams", async function() {
      const res = await server
        .request()
        .del(reqPath(streamInId))
        .set('Authorization', appAccessToken1);
      assert.equal(res.status, 403);
    });
  });
});
