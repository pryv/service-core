/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, it*/

const { getConfig } = require('@pryv/boiler');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('../test-helpers');
const charlatan = require('charlatan');
const cuid = require('cuid');
const assert = require('chai').assert;
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

describe('XXSystem stream id) prefix retro-compatibility', () => {

  let config;
  let mongoFixtures;
  let server;
  let username;
  let token;
  let eventId;
  let systemEventId;
  let streamId;
  let accessId;
  before(async () => {
    config = await getConfig();
  
    mongoFixtures = databaseFixture(await produceMongoConnection());

    username = cuid();
    token = cuid();
    streamId = cuid();
    const user = await mongoFixtures.user(username);
    const stream = await user.stream({ id: streamId }, () => {});
    const event = await stream.event({
      streamIds: [streamId],
      type: 'language/iso-639-1',
      content: charlatan.Lorem.characters(2),
    });
    eventId = event.attrs.id;
    await user.access({ token, type: 'personal' });
    await user.session(token);

    server = await context.spawn({ 
      retroCompatibility: { systemStreams: { prefix: { isActive: true } } },
      dnsLess: { isActive: true }, // so updating account streams does not notify register
      versioning: { 
        deletionMode: 'keep-everything',
        forceKeepHistory: true,
      },
    });

    const res = await get(`/${username}/events`);
    const systemEvent = res.body.events.find(e => e.streamIds.includes('.language'));
    systemEventId = systemEvent.id;
    await put(`/${username}/events/${systemEventId}`, {
      content: charlatan.Lorem.characters(2),
    });
    await post(`/${username}/events`, {
      streamIds: ['.language'],
      type: 'language/iso-639-1',
      content: charlatan.Lorem.characters(2),
    });
  });

  after(async () => {
    await server.stop();
    await mongoFixtures.clean();
    config.injectTestConfig({});
  });

  function checkOldPrefixes(streamIds) {
    for (const streamId of streamIds) {
      checkOldPrefix(streamId);
    }
  }
  function checkOldPrefix(streamId) {
    if (! SystemStreamsSerializer.isSystemStreamId(streamId)) return;
    const DOT = '.';
    const PRYV_PREFIX = ':_system:';
    const CUSTOMER_PREFIX = ':system:';
    assert.isTrue(streamId.startsWith(DOT), `streamId "${streamId}" does not start with "${DOT}"`);
    assert.isFalse(streamId.startsWith(PRYV_PREFIX), `streamId "${streamId}" starts with "${PRYV_PREFIX}"`);
    assert.isFalse(streamId.startsWith(CUSTOMER_PREFIX), `streamId "${streamId}" starts with "${CUSTOMER_PREFIX}"`);
  }
  async function post(path, payload, query) {
    return await server.request()
    .post(path)
    .set('Authorization', token)
    .set('Content-Type', 'application/json')
    .send(payload);
  }
  async function get(path, query) {
    return await server.request()
      .get(path)
      .set('Authorization', token)
      .query(query);
  }
  async function put(path, payload, query) {
    return await server.request()
      .put(path)
      .set('Authorization', token)
      .query(query)
      .send(payload);
  }
  async function del(path, query) {
    return await server.request()
      .del(path)
      .set('Authorization', token)
      .query(query);
  }

  // for all use cases, make double one with retro-compatibility breaking parameter
  describe('events', () => {
    it('[Q40I] must return old prefixes in events.get', async () => {
      const res = await get(`/${username}/events`);
      for (const event of res.body.events) {
        checkOldPrefixes(event.streamIds);
      }
    });
    it('[4YCD] must accept old prefixes in events.get', async () => {
      const res = await get(`/${username}/events`, { streams: ['.email']});
      assert.equal(res.status, 200);
      for (const event of res.body.events) {
        checkOldPrefixes(event.streamIds);
      }
    });
    it('[CF3N] must return old prefixes in events.getOne (including history)', async () => {
      const res = await get(`/${username}/events/${systemEventId}`, { includeHistory: true });
      checkOldPrefixes(res.body.event.streamIds);
      for (const event of res.body.history) {
        checkOldPrefixes(event.streamIds);
      }
    });
    it('[U28C] must accept old prefixes in events.create', async () => {
      const res = await post(`/${username}/events/`, {
        streamIds: ['.language'],
        type: 'language/iso-639-1',
        content: charlatan.Lorem.characters(2),
      });
      assert.equal(res.status, 201);
      checkOldPrefixes(res.body.event.streamIds);
    });
    it('[YIWX] must return old prefixes in events.update', async () => {
      const res = await put(`/${username}/events/${systemEventId}`, {
        content: charlatan.Lorem.characters(2),
      });
      checkOldPrefixes(res.body.event.streamIds);
    });
    it('[75DN] must return old prefixes in events.delete', async () => {
      const res = await del(`/${username}/events/${systemEventId}`);
      checkOldPrefixes(res.body.event.streamIds);
    });
  });
  describe('streams', () => {
    it('[WY07] must return old prefixes in streams.get', async () => {
      const res = await get(`/${username}/streams/`);
      for (const stream of res.body.streams) {
        checkOldPrefix(stream.id);
        checkOldPrefix(stream.parentId);
      }
    });
    it('[YJS6] must accept old prefixes in streams.get', async () => {
      const res = await get(`/${username}/streams/`, { parentId: '.account'});
      for (const stream of res.body.streams) {
        checkOldPrefix(stream.id);
        checkOldPrefix(stream.parentId);
      }
    });
    it('[CCE8] must handle old prefixes in streams.create', async () => {
      const res = await post(`/${username}/streams/`, {
        id: charlatan.Lorem.word(),
        name: charlatan.Lorem.word(),
        parentId: '.language',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
    });
    it('[4DP2] must accept old prefixes in streams.update', async () => {
      const res = await put(`/${username}/streams/.language`, {
        content: charlatan.Lorem.characters(2),
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
    });
    it('[LQ5X] must return old prefixes in streams.delete', async () => {
      const res = await del(`/${username}/streams/.language`);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
    });
  });
  describe('accesses', () => {
    it('[UDJF] must return old prefixes in accesses.get', async () => {
      
    });
    it('[DWWD] must accept old prefixes in accesses.create', async () => {

    });
  });
  
});