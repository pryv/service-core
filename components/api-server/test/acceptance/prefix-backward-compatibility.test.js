/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, it*/

const { getConfig } = require('@pryv/boiler');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('api-server/test/test-helpers');
const charlatan = require('charlatan');
const cuid = require('cuid');
const assert = require('chai').assert;
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const timestamp = require('unix-timestamp');

describe('(System stream id) prefix backward-compatibility', () => {

  const DISABLE_BACKWARD_COMPATIBILITY_PARAM = 'disable-backward-compatibility-prefix';

  const DOT = '.';
  const PRYV_PREFIX = ':_system:';
  const CUSTOMER_PREFIX = ':system:';

  let config;
  let mongoFixtures;
  let server;
  let username;
  let token;
  let systemEventId;
  before(async () => {
    config = await getConfig();
  
    mongoFixtures = databaseFixture(await produceMongoConnection());

    username = cuid();
    token = cuid();
    const user = await mongoFixtures.user(username);
    const stream = await user.stream();
    const event = await stream.event({
      type: 'language/iso-639-1',
      content: charlatan.Lorem.characters(2),
    });
    await user.access({
      permissions: [{
        streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
        level: 'read',
      }],
    });
    const access = await user.access({
      permissions: [{
        streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
        level: 'read',
      }],
    });
    const accessId = access.attrs.id;

    await user.access({ token, type: 'personal' });
    await user.session(token);

    server = await context.spawn({ 
      backwardCompatibility: { systemStreams: { prefix: { isActive: true } } },
      dnsLess: { isActive: true }, // so updating account streams does not notify register
      versioning: { 
        deletionMode: 'keep-everything',
        forceKeepHistory: true,
      },
    });

    await del(`/${username}/accesses/${accessId}`);

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
  /**
   * if old prefix, must be system stream
   * if not, and not system stream, fine
   * if not, and systemStream, not fine
   */
  function checkOldPrefix(streamId) {
    if (streamId.startsWith(DOT)) {
      
      const streamIdWithoutPrefix = removeDot(streamId);
      let customStreamIdVariant, privateStreamIdVariant
      try { customStreamIdVariant = SystemStreamsSerializer.addCustomerPrefixToStreamId(streamIdWithoutPrefix); } catch (e) {}
      try { privateStreamIdVariant = SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix); } catch (e) {}
      assert.isTrue(customStreamIdVariant != null || privateStreamIdVariant != null, 'streamId starting with dot but neither custom nor private: ' + streamId);
    } else {
      if (! SystemStreamsSerializer.isSystemStreamId(streamId)) return;
      assert.isFalse(streamId.startsWith(PRYV_PREFIX), `streamId "${streamId}" starts with "${PRYV_PREFIX}"`);
      assert.isFalse(streamId.startsWith(CUSTOMER_PREFIX), `streamId "${streamId}" starts with "${CUSTOMER_PREFIX}"`);
    }
    function removeDot(streamId) {
      return streamId.substring(1);
    }
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

  describe('events', () => {
    it('[Q40I] must return old prefixes in events.get', async () => {
      const res = await get(`/${username}/events`);
      assert.isNotEmpty(res.body.events);
      for (const event of res.body.events) {
        checkOldPrefixes(event.streamIds);
      }
    });
    it('[4YCD] must accept old prefixes in events.get', async () => {
      const res = await get(`/${username}/events`, { streams: ['.email']});
      assert.equal(res.status, 200);
      assert.isNotEmpty(res.body.events);
      for (const event of res.body.events) {
        checkOldPrefixes(event.streamIds);
      }
    });
    it('[CF3N] must return old prefixes in events.getOne (including history)', async () => {
      const res = await get(`/${username}/events/${systemEventId}`, { includeHistory: true });
      checkOldPrefixes(res.body.event.streamIds);
      assert.isNotEmpty(res.body.history);
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
      assert.isNotEmpty(res.body.streams);
      for (const stream of res.body.streams) {
        checkOldPrefix(stream.id);
        if (stream.parentId != null) checkOldPrefix(stream.parentId);
      }
    });
    it('[YJS6] must accept old prefixes in streams.get', async () => {
      const res = await get(`/${username}/streams/`, { parentId: '.account'});
      assert.isNotEmpty(res.body.streams);
      for (const stream of res.body.streams) {
        checkOldPrefix(stream.id);
        if (stream.parentId != null) checkOldPrefix(stream.parentId);
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
      const res = await get(`/${username}/accesses/`, {
        includeExpired: true,
        includeDeletions: true,
      });
      const accesses = res.body.accesses;
      assert.isNotEmpty(accesses);
      for (const access of accesses) {
        if (access.permissions == null) continue;
        for (permission of access.permissions) {
          checkOldPrefix(permission.streamId);
        }
      }
      const deletions = res.body.accessDeletions;
      assert.isNotEmpty(deletions);
      for (const access of deletions) {
        if (access.permissions == null) continue;
        for (permission of access.permissions) {
          checkOldPrefix(permission.streamId);
        }
      }
      
    });
    it('[DWWD] must accept old prefixes in accesses.create', async () => {
      const res = await post(`/${username}/accesses/`, {
        name: charlatan.Lorem.characters(10),
        permissions: [{
          streamId: '.passwordHash',
          level: 'read',
        }],
        clientData: {
          something: 'hi'
        }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
    });
  });

  describe('when disabling backward compatibility using the header param to use new prefixes', () => {

    before(async () => {
      const res = await get(`/${username}/events`);
      const systemEvent = res.body.events.find(e => e.streamIds.includes(SystemStreamsSerializer.addPrivatePrefixToStreamId('language')));
      systemEventId = systemEvent.id;
      await put(`/${username}/events/${systemEventId}`, {
        content: charlatan.Lorem.characters(2),
      });
      await post(`/${username}/events`, {
        streamIds: [SystemStreamsSerializer.addPrivatePrefixToStreamId('language')],
        type: 'language/iso-639-1',
        content: charlatan.Lorem.characters(2),
      });
    })

    async function post(path, payload, query) {
      return await server.request()
        .post(path)
        .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, 'true')
        .set('Authorization', token)
        .set('Content-Type', 'application/json')
        .send(payload);
    }
    async function get(path, query) {
      return await server.request()
        .get(path)
        .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, 'true')
        .set('Authorization', token)
        .query(query);
    }
    async function put(path, payload, query) {
      return await server.request()
        .put(path)
        .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, true)
        .set('Authorization', token)
        .query(query)
        .send(payload);
    }
    async function del(path, query) {
      return await server.request()
        .del(path)
        .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, true)
        .set('Authorization', token)
        .query(query);
    }

    function checkNewPrefixes(streamIds) {
      for (const streamId of streamIds) {
        checkNewPrefix(streamId);
      }
    }
    function checkNewPrefix(streamId) {
      assert.isFalse(streamId.startsWith(DOT), `streamId "${streamId}" starts with "${DOT}"`);
      if (! SystemStreamsSerializer.isSystemStreamId(streamId)) return;
      if (SystemStreamsSerializer.isPrivateSystemStreamId(streamId)) 
        assert.isTrue(streamId.startsWith(PRYV_PREFIX), `streamId "${streamId}" does not start with "${PRYV_PREFIX}"`);
      if (SystemStreamsSerializer.isCustomerSystemStreamId(streamId))
        assert.isTrue(streamId.startsWith(CUSTOMER_PREFIX), `streamId "${streamId}" does not start with "${CUSTOMER_PREFIX}"`);
    }

    describe('events', () => {
      it('[CZN1] must return new prefixes in events.get', async () => {
        const res = await get(`/${username}/events`);
        assert.isNotEmpty(res.body.events);
        //console.log(JSON.stringify(res.body,null,2))
        for (const event of res.body.events) {
          checkNewPrefixes(event.streamIds);
        }
      });
      it('[SHW1] must accept new prefixes in events.get', async () => {
        const res = await get(`/${username}/events`, { streams: [SystemStreamsSerializer.addCustomerPrefixToStreamId('email')]});
        assert.equal(res.status, 200);
        assert.isNotEmpty(res.body.events);
        for (const event of res.body.events) {
          checkNewPrefixes(event.streamIds);
        }
      });
      it('[6N5B] must return new prefixes in events.getOne (including history)', async () => {
        const res = await get(`/${username}/events/${systemEventId}`, { includeHistory: true });
        checkNewPrefixes(res.body.event.streamIds);
        assert.isNotEmpty(res.body.history);
        for (const event of res.body.history) {
          checkNewPrefixes(event.streamIds);
        }
      });
      it('[65U8] must accept new prefixes in events.create', async () => {
        const res = await post(`/${username}/events/`, {
          streamIds: [SystemStreamsSerializer.addPrivatePrefixToStreamId('language')],
          type: 'language/iso-639-1',
          content: charlatan.Lorem.characters(2),
        });
        assert.equal(res.status, 201);
        checkNewPrefixes(res.body.event.streamIds);
      });
      it('[CSKF] must return new prefixes in events.update', async () => {
        const res = await put(`/${username}/events/${systemEventId}`, {
          content: charlatan.Lorem.characters(2),
        });
        checkNewPrefixes(res.body.event.streamIds);
      });
      it('[4IEX] must return new prefixes in events.delete', async () => {
        const res = await del(`/${username}/events/${systemEventId}`);
        checkNewPrefixes(res.body.event.streamIds);
      });
    });
    describe('streams', () => {
      it('[O7RD] must return new prefixes in streams.get', async () => {
        const res = await get(`/${username}/streams/`);
        assert.isNotEmpty(res.body.streams);
        for (const stream of res.body.streams) {
          checkNewPrefix(stream.id);
          if (stream.parentId != null) checkNewPrefix(stream.parentId);
        }
      });
      it('[VMH7] must accept new prefixes in streams.get', async () => {
        const res = await get(`/${username}/streams/`, { parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account')});
        assert.isNotEmpty(res.body.streams);
        for (const stream of res.body.streams) {
          checkNewPrefix(stream.id);
          if (stream.parentId != null) checkNewPrefix(stream.parentId);
        }
      });
      it('[6EFG] must handle new prefixes in streams.create', async () => {
        const res = await post(`/${username}/streams/`, {
          id: charlatan.Lorem.word(),
          name: charlatan.Lorem.word(),
          parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('language'),
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
      });
      it('[LVOF] must accept new prefixes in streams.update', async () => {
        const res = await put(`/${username}/streams/${SystemStreamsSerializer.addPrivatePrefixToStreamId('language')}`, {
          content: charlatan.Lorem.characters(2),
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
      });
      it('[C73R] must return new prefixes in streams.delete', async () => {
        const res = await del(`/${username}/streams/${SystemStreamsSerializer.addPrivatePrefixToStreamId('language')}`);
        assert.equal(res.status, 400);
        assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
      });
    });
    describe('accesses', () => {
      it('[O9OH] must return new prefixes in accesses.get', async () => {
        const res = await get(`/${username}/accesses/`, {
          includeExpired: true,
          includeDeletions: true,
        });
        const accesses = res.body.accesses;
        assert.isNotEmpty(accesses);
        for (const access of accesses) {
          if (access.permissions == null) continue;
          for (permission of access.permissions) {
            checkNewPrefix(permission.streamId);
          }
        }
        const deletions = res.body.accessDeletions;
        assert.isNotEmpty(deletions);
        for (const access of deletions) {
          if (access.permissions == null) continue;
          for (permission of access.permissions) {
            checkNewPrefix(permission.streamId);
          }
        }
        
      });
      it('[GFRT] must accept new prefixes in accesses.create', async () => {
        const res = await post(`/${username}/accesses/`, {
          name: charlatan.Lorem.characters(10),
          permissions: [{
            streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId('passwordHash'),
            level: 'read',
          }],
          clientData: {
            something: 'hi'
          }
        });
        assert.equal(res.status, 400);
        assert.equal(res.body.error.id, 'invalid-operation'); // not unknown referenced streamId
      });
    });
  })
});
