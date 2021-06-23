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

describe('(System stream id) prefix retro-compatibility', () => {

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

    server = await context.spawn({ retroCompatibility: { systemStreams: { prefix: { isActive: true } } } });

    const res = await server.request()
      .get(`/${username}/events`)
      .set('Authorization', token);
    const systemEvent = res.body.events.find(e => e.streamIds.includes('.language'));
    systemEventId = systemEvent.id;
  });

  after(async () => {
    await server.stop();
    await mongoFixtures.clean();
    config.injectTestConfig({});
  });

  function checkOldPrefix(streamIds) {
    for (const streamId of streamIds) {
      if (! SystemStreamsSerializer.isSystemStreamId(streamId)) continue;
      const DOT = '.';
      const PRYV_PREFIX = ':_system:';
      const CUSTOMER_PREFIX = ':system:';
      assert.isTrue(streamId.startsWith(DOT), `streamId "${streamId}" does not start with "${DOT}"`);
      assert.isFalse(streamId.startsWith(PRYV_PREFIX), `streamId "${streamId}" starts with "${PRYV_PREFIX}"`);
      assert.isFalse(streamId.startsWith(CUSTOMER_PREFIX), `streamId "${streamId}" starts with "${CUSTOMER_PREFIX}"`);
    }
  }

  // for all use cases, make double one with retro-compatibility breaking parameter
  describe('events', () => {
    it('[Q40I] must return old prefixes in events.get', async () => {
      const res = await server.request()
        .get(`/${username}/events`)
        .set('Authorization', token);
      for (const event of res.body.events) {
        checkOldPrefix(event.streamIds);
      }
    });
    it('[4YCD] must accept old prefixes in events.get', async () => {
      // TODO: where should I put the streams query param translation??
      const res = await server.request()
        .get(`/${username}/events`)
        .set('Authorization', token)
        .query({ streams: ['.email']});
      assert.equal(res.status, 200);
      const event = res.body.events[0];
      checkOldPrefix(event.streamIds);
    });
    it('[CF3N] must return old prefixes in events.getOne', async () => {
      const res = await server.request()
        .get(`/${username}/events/${systemEventId}`)
        .set('Authorization', token);
      checkOldPrefix(res.body.event.streamIds);
    });
    it('[U28C] must accept old prefixes in events.create', async () => {
      const res = await server.request()
        .get(`/${username}/events/${systemEventId}`)
        .set('Authorization', token);
    });
    it('[YIWX] must accept old prefixes in events.update', async () => {

    });
    it('[75DN] must return old prefixes in events.delete', async () => {

    });
  });
  describe('streams', () => {
    it('[WY07] must return old prefixes in streams.get', async () => {

    });
    it('[YJS6] must accept old prefixes in streams.get', async () => {

    });
    it('[CCE8] must accept old prefixes in streams.create', async () => {

    });
    it('[4DP2] must accept old prefixes in streams.update', async () => {

    });
    it('[LQ5X] must return old prefixes in streams.delete', async () => {

    });
  });
  describe('accesses', () => {
    it('[UDJF] must return old prefixes in accesses.get', async () => {

    });
    it('[DWWD] must accept old prefixes in accesses.create', async () => {

    });
  });
  
});