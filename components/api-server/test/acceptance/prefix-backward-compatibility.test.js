/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Backward compatibility tests (Pattern C)
 * Run with: PATTERN_C_BACKWARD_COMPAT=1 npx mocha --no-config --require test/helpers-c.js test/acceptance/prefix-backward-compatibility.test.js
 */

/* global initTests, initCore, coreRequest, getNewFixture, assert, cuid, charlatan */

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { TAG_PREFIX, TAG_ROOT_STREAMID } = require('api-server/src/methods/helpers/backwardCompatibility');
const { findById } = require('utils/src/treeUtils');

describe('[BKWD] backward-compatibility (Pattern C)', () => {
  describe('[BW01] Tags as prefixed streams', () => {
    let username;
    let token;
    let streamId;
    let basePath;

    before(async () => {
      await initTests();
      await SystemStreamsSerializer.init();
      await initCore();

      const fixtures = getNewFixture();
      username = cuid();
      token = cuid();
      streamId = cuid();
      basePath = '/' + username;

      const user = await fixtures.user(username);
      await user.stream({ id: streamId });
      await user.stream({ id: TAG_ROOT_STREAMID });
      await user.access({ token, type: 'personal' });
      await user.session(token);
    });

    function post (methodsPath, payload) {
      return coreRequest
        .post(`${basePath}/${methodsPath}`)
        .set('Authorization', token)
        .send(payload);
    }

    function put (methodsPath, payload) {
      return coreRequest
        .put(`${basePath}/${methodsPath}`)
        .set('Authorization', token)
        .send(payload);
    }

    function get (methodsPath) {
      return coreRequest
        .get(`${basePath}/${methodsPath}`)
        .set('Authorization', token);
    }

    describe('[BW02] when the stream associated to the tag exists', () => {
      describe('[BW03] when creating an event', () => {
        let tag;

        before(async () => {
          tag = charlatan.Lorem.characters(15);
          await post('streams', {
            id: TAG_PREFIX + tag,
            parentId: TAG_ROOT_STREAMID
          });
        });

        it('[V39L] must create the event with the streamIds translated from tags', async () => {
          const res = await post('events', {
            type: 'activity/plain',
            streamIds: [streamId],
            tags: [tag]
          });
          assert.strictEqual(res.status, 201);
          const event = res.body.event;
          assert.deepStrictEqual({
            tags: event.tags,
            streamIds: event.streamIds
          }, {
            tags: [tag],
            streamIds: [streamId, TAG_PREFIX + tag]
          }, 'event does not have tags or prefixed streamIds');
        });
      });
    });

    describe('[BW04] when the stream associated to the tag does not exist', () => {
      describe('[BW05] when creating an event', () => {
        let tag;

        before(() => {
          tag = charlatan.Lorem.characters(15);
        });

        it('[OMGX] must create the streams with the streamId translated from tags and adapt the event as accordingly', async () => {
          const res = await post('events', {
            type: 'activity/plain',
            streamIds: [streamId],
            tags: [tag]
          });
          assert.strictEqual(res.status, 201);
          const res2 = await get('streams');
          assert.strictEqual(res2.status, 200);
          const streams = res2.body.streams;
          const stream = findById(streams, TAG_PREFIX + tag);
          assert.ok(stream);
          assert.strictEqual(stream.parentId, TAG_ROOT_STREAMID);
        });
      });

      describe('[BW06] when updating an event', () => {
        let tag;
        let eventId;

        before(async () => {
          tag = charlatan.Lorem.characters(15);
          const res = await post('events', {
            type: 'activity/plain',
            streamIds: [streamId]
          });
          eventId = res.body.event.id;
        });

        it('[NWQ6] must create the streams with the streamId translated from tags and adapt the event as accordingly', async () => {
          const res = await put(`events/${eventId}`, { tags: [tag] });
          assert.strictEqual(res.status, 200);
          const res2 = await get('streams');
          assert.strictEqual(res2.status, 200);
          const streams = res2.body.streams;
          const stream = findById(streams, TAG_PREFIX + tag);
          assert.ok(stream);
          assert.strictEqual(stream.parentId, TAG_ROOT_STREAMID);
        });
      });
    });

    describe('[BW07] when fetching events', () => {
      before(async () => {
        await post('events', {
          streamIds: [streamId],
          type: 'activity/plain',
          tags: ['hello']
        });
      });

      it('[R3NU] should return the event with its tags', async () => {
        const res = await get('events');
        assert.strictEqual(res.status, 200);
        const events = res.body.events;
        const eventWithTags = events.filter(e => e.tags && e.tags.includes('hello'));
        assert.ok(eventWithTags.length > 0);
      });
    });
  });

  describe('[BW08] System stream id prefix', function () {
    const DISABLE_BACKWARD_COMPATIBILITY_PARAM = 'disable-backward-compatibility-prefix';
    const DOT = '.';
    const PRYV_PREFIX = ':_system:';
    const CUSTOMER_PREFIX = ':system:';

    let username;
    let token;
    let systemEventId;
    let basePath;

    before(async function () {
      await initTests();

      // Skip if backward compatibility prefix is not active
      const { getConfig } = require('@pryv/boiler');
      const config = await getConfig();
      if (!config.get('backwardCompatibility:systemStreams:prefix:isActive')) {
        this.skip();
        return;
      }

      await SystemStreamsSerializer.init();
      await initCore();

      const fixtures = getNewFixture();
      username = cuid();
      token = cuid();
      basePath = '/' + username;

      const user = await fixtures.user(username);
      const stream = await user.stream();
      await stream.event({
        type: 'language/iso-639-1',
        content: charlatan.Lorem.characters(2)
      });

      await user.access({
        permissions: [{
          streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
          level: 'read'
        }]
      });

      const access = await user.access({
        permissions: [{
          streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
          level: 'read'
        }]
      });
      const accessId = access.attrs.id;

      await user.access({ token, type: 'personal' });
      await user.session(token);

      // Delete an access to have deletion records
      await del(`${basePath}/accesses/${accessId}`);

      // Get a system event to use in tests
      const res = await get(`${basePath}/events`);
      const systemEvent = res.body.events.find(e => e.streamIds.includes('.language'));
      if (systemEvent) {
        systemEventId = systemEvent.id;
        await put(`${basePath}/events/${systemEventId}`, {
          content: charlatan.Lorem.characters(2)
        });
      }

      await post(`${basePath}/events`, {
        streamIds: ['.language'],
        type: 'language/iso-639-1',
        content: charlatan.Lorem.characters(2)
      });
    });

    function checkOldPrefixes (streamIds) {
      for (const streamId of streamIds) {
        checkOldPrefix(streamId);
      }
    }

    function checkOldPrefix (streamId) {
      if (streamId.startsWith(DOT)) {
        const streamIdWithoutPrefix = streamId.substring(1);
        let customStreamIdVariant, privateStreamIdVariant;
        try { customStreamIdVariant = SystemStreamsSerializer.addCustomerPrefixToStreamId(streamIdWithoutPrefix); } catch (e) {}
        try { privateStreamIdVariant = SystemStreamsSerializer.addPrivatePrefixToStreamId(streamIdWithoutPrefix); } catch (e) {}
        assert.strictEqual(customStreamIdVariant != null || privateStreamIdVariant != null, true, 'streamId starting with dot but neither custom nor private: ' + streamId);
      } else {
        if (!SystemStreamsSerializer.isSystemStreamId(streamId)) return;
        assert.strictEqual(streamId.startsWith(PRYV_PREFIX), false, `streamId "${streamId}" starts with "${PRYV_PREFIX}"`);
        assert.strictEqual(streamId.startsWith(CUSTOMER_PREFIX), false, `streamId "${streamId}" starts with "${CUSTOMER_PREFIX}"`);
      }
    }

    async function post (path, payload) {
      return await coreRequest
        .post(path)
        .set('Authorization', token)
        .set('Content-Type', 'application/json')
        .send(payload);
    }

    async function get (path, query) {
      return await coreRequest
        .get(path)
        .set('Authorization', token)
        .query(query || {});
    }

    async function put (path, payload, query) {
      return await coreRequest
        .put(path)
        .set('Authorization', token)
        .query(query || {})
        .send(payload);
    }

    async function del (path, query) {
      return await coreRequest
        .del(path)
        .set('Authorization', token)
        .query(query || {});
    }

    describe('[BW09] Account streams reserved words', () => {
      it('[4L48] Can create an "account" stream, and add event to it', async () => {
        const batchOps = [
          {
            method: 'streams.create',
            params: { id: 'account', name: 'account' }
          },
          {
            method: 'events.create',
            params: { type: 'note/txt', content: 'hello', streamId: 'account' }
          },
          {
            method: 'events.get',
            params: { streams: ['account'] }
          }
        ];
        const res = await post(`${basePath}/`, batchOps);
        const results = res.body.results;
        assert.strictEqual(results?.length, 3);
        assert.strictEqual(results[0]?.stream?.id, 'account', 'stream should have been created');
        assert.strictEqual(results[1]?.event?.streamId, 'account', 'event should have been created in account stream');
        assert.ok(Array.isArray(results[2]?.events), 'events should have been returned');
        assert.strictEqual(results[2]?.events?.length, 1, 'events should have been returned');
        assert.strictEqual(results[2]?.events?.[0]?.streamId, 'account', 'event should have been returned in account stream');
      });
    });

    describe('[BW10] events', () => {
      it('[Q40I] must return old prefixes in events.get', async () => {
        const res = await get(`${basePath}/events`);
        assert.ok(res.body.events);
        for (const event of res.body.events) {
          checkOldPrefixes(event.streamIds);
        }
      });

      it('[4YCD] must accept old prefixes in events.get', async () => {
        const res = await get(`${basePath}/events`, { streams: ['.email'] });
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.events);
        for (const event of res.body.events) {
          checkOldPrefixes(event.streamIds);
        }
      });

      it('[CF3N] must return old prefixes in events.getOne (including history)', async function () {
        if (!systemEventId) this.skip();
        const res = await get(`${basePath}/events/${systemEventId}`, { includeHistory: true });
        checkOldPrefixes(res.body.event.streamIds);
        assert.ok(res.body.history);
        for (const event of res.body.history) {
          checkOldPrefixes(event.streamIds);
        }
      });

      it('[U28C] must accept old prefixes in events.create', async () => {
        const res = await post(`${basePath}/events/`, {
          streamIds: ['.language'],
          type: 'language/iso-639-1',
          content: charlatan.Lorem.characters(2)
        });
        assert.strictEqual(res.status, 201);
        checkOldPrefixes(res.body.event.streamIds);
      });

      it('[YIWX] must return old prefixes in events.update', async function () {
        if (!systemEventId) this.skip();
        const res = await put(`${basePath}/events/${systemEventId}`, {
          content: charlatan.Lorem.characters(2)
        });
        checkOldPrefixes(res.body.event.streamIds);
      });

      it('[75DN] must return old prefixes in events.delete', async function () {
        if (!systemEventId) this.skip();
        const res = await del(`${basePath}/events/${systemEventId}`);
        checkOldPrefixes(res.body.event.streamIds);
      });
    });

    describe('[BW11] streams', () => {
      it('[WY07] must return old prefixes in streams.get', async () => {
        const res = await get(`${basePath}/streams/`);
        assert.ok(res.body.streams);

        function checkStream (stream) {
          checkOldPrefix(stream.id);
          if (stream.parentId != null) checkOldPrefix(stream.parentId);
          if (stream.children) {
            for (const child of stream.children) {
              checkStream(child);
            }
          }
        }

        for (const stream of res.body.streams) {
          checkStream(stream);
        }
      });

      it('[YJS6] must accept old prefixes in streams.get', async () => {
        const res = await get(`${basePath}/streams/`, { parentId: '.account' });
        assert.ok(res.body.streams);
        for (const stream of res.body.streams) {
          checkOldPrefix(stream.id);
          if (stream.parentId != null) checkOldPrefix(stream.parentId);
        }
      });

      it('[CCE8] must handle old prefixes in streams.create', async () => {
        const res = await post(`${basePath}/streams/`, {
          id: charlatan.Lorem.word(),
          name: charlatan.Lorem.word(),
          parentId: '.language'
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.error.id, 'invalid-operation');
      });

      it('[4DP2] must accept old prefixes in streams.update', async () => {
        const res = await put(`${basePath}/streams/.language`, {
          content: charlatan.Lorem.characters(2)
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.error.id, 'invalid-operation');
      });

      it('[LQ5X] must return old prefixes in streams.delete', async () => {
        const res = await del(`${basePath}/streams/.language`);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.error.id, 'invalid-operation');
      });
    });

    describe('[BW12] accesses', () => {
      it('[UDJF] must return old prefixes in accesses.get', async () => {
        const res = await get(`${basePath}/accesses/`, {
          includeExpired: true,
          includeDeletions: true
        });
        const accesses = res.body.accesses;
        assert.ok(accesses);
        for (const access of accesses) {
          if (access.permissions == null) continue;
          for (const permission of access.permissions) {
            checkOldPrefix(permission.streamId);
          }
        }
        const deletions = res.body.accessDeletions;
        if (deletions) {
          for (const access of deletions) {
            if (access.permissions == null) continue;
            for (const permission of access.permissions) {
              checkOldPrefix(permission.streamId);
            }
          }
        }
      });

      it('[DWWD] must accept old prefixes in accesses.create', async () => {
        const res = await post(`${basePath}/accesses/`, {
          name: charlatan.Lorem.characters(10),
          permissions: [{
            streamId: '.invitationToken',
            level: 'read'
          }, {
            feature: 'selfRevoke',
            setting: 'forbidden'
          }],
          clientData: { something: 'hi' }
        });
        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.error.id, 'invalid-operation');
      });
    });

    describe('[BW13] when disabling backward compatibility using the header param to use new prefixes', () => {
      let newPrefixSystemEventId;

      before(async () => {
        // Look for events with OLD prefix (.language) since get() returns old prefixes
        const res = await get(`${basePath}/events`);
        const systemEvent = res.body.events.find(e => e.streamIds.includes('.language'));
        if (systemEvent) {
          newPrefixSystemEventId = systemEvent.id;
          // Update to create history
          await putNew(`${basePath}/events/${newPrefixSystemEventId}`, {
            content: charlatan.Lorem.characters(2)
          });
        }
        await postNew(`${basePath}/events`, {
          streamIds: [SystemStreamsSerializer.addPrivatePrefixToStreamId('language')],
          type: 'language/iso-639-1',
          content: charlatan.Lorem.characters(2)
        });
      });

      async function postNew (path, payload) {
        return await coreRequest
          .post(path)
          .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, 'true')
          .set('Authorization', token)
          .set('Content-Type', 'application/json')
          .send(payload);
      }

      async function getNew (path, query) {
        return await coreRequest
          .get(path)
          .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, 'true')
          .set('Authorization', token)
          .query(query || {});
      }

      async function putNew (path, payload, query) {
        return await coreRequest
          .put(path)
          .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, 'true')
          .set('Authorization', token)
          .query(query || {})
          .send(payload);
      }

      async function delNew (path, query) {
        return await coreRequest
          .del(path)
          .set(DISABLE_BACKWARD_COMPATIBILITY_PARAM, 'true')
          .set('Authorization', token)
          .query(query || {});
      }

      function checkNewPrefixes (streamIds) {
        for (const streamId of streamIds) {
          checkNewPrefix(streamId);
        }
      }

      function checkNewPrefix (streamId) {
        assert.strictEqual(streamId.startsWith(DOT), false, `streamId "${streamId}" starts with "${DOT}"`);
        if (!SystemStreamsSerializer.isSystemStreamId(streamId)) return;
        if (SystemStreamsSerializer.isPrivateSystemStreamId(streamId)) {
          assert.strictEqual(streamId.startsWith(PRYV_PREFIX), true, `streamId "${streamId}" does not start with "${PRYV_PREFIX}"`);
        }
        if (SystemStreamsSerializer.isCustomerSystemStreamId(streamId)) {
          assert.strictEqual(streamId.startsWith(CUSTOMER_PREFIX), true, `streamId "${streamId}" does not start with "${CUSTOMER_PREFIX}"`);
        }
      }

      describe('[BW14] events', () => {
        it('[CZN1] must return new prefixes in events.get', async () => {
          const res = await getNew(`${basePath}/events`);
          assert.ok(res.body.events);
          for (const event of res.body.events) {
            checkNewPrefixes(event.streamIds);
          }
        });

        it('[SHW1] must accept new prefixes in events.get', async () => {
          const res = await getNew(`${basePath}/events`, { streams: [SystemStreamsSerializer.addCustomerPrefixToStreamId('email')] });
          assert.strictEqual(res.status, 200);
          assert.ok(res.body.events);
          for (const event of res.body.events) {
            checkNewPrefixes(event.streamIds);
          }
        });

        it('[6N5B] must return new prefixes in events.getOne (including history)', async function () {
          if (!newPrefixSystemEventId) this.skip();
          const res = await getNew(`${basePath}/events/${newPrefixSystemEventId}`, { includeHistory: true });
          checkNewPrefixes(res.body.event.streamIds);
          assert.ok(res.body.history);
          for (const event of res.body.history) {
            checkNewPrefixes(event.streamIds);
          }
        });

        it('[65U8] must accept new prefixes in events.create', async () => {
          const res = await postNew(`${basePath}/events/`, {
            streamIds: [SystemStreamsSerializer.addPrivatePrefixToStreamId('language')],
            type: 'language/iso-639-1',
            content: charlatan.Lorem.characters(2)
          });
          assert.strictEqual(res.status, 201);
          checkNewPrefixes(res.body.event.streamIds);
        });

        it('[CSKF] must return new prefixes in events.update', async function () {
          if (!newPrefixSystemEventId) this.skip();
          const res = await putNew(`${basePath}/events/${newPrefixSystemEventId}`, {
            content: charlatan.Lorem.characters(2)
          });
          checkNewPrefixes(res.body.event.streamIds);
        });

        it('[4IEX] must return new prefixes in events.delete', async function () {
          if (!newPrefixSystemEventId) this.skip();
          const res = await delNew(`${basePath}/events/${newPrefixSystemEventId}`);
          checkNewPrefixes(res.body.event.streamIds);
        });
      });

      describe('[BW15] streams', () => {
        it('[O7RD] must return new prefixes in streams.get', async () => {
          const res = await getNew(`${basePath}/streams/`);
          assert.ok(res.body.streams);
          for (const stream of res.body.streams) {
            checkNewPrefix(stream.id);
            if (stream.parentId != null) checkNewPrefix(stream.parentId);
          }
        });

        it('[VMH7] must accept new prefixes in streams.get', async () => {
          const res = await getNew(`${basePath}/streams/`, { parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account') });
          assert.ok(res.body.streams);
          for (const stream of res.body.streams) {
            checkNewPrefix(stream.id);
            if (stream.parentId != null) checkNewPrefix(stream.parentId);
          }
        });

        it('[6EFG] must handle new prefixes in streams.create', async () => {
          const res = await postNew(`${basePath}/streams/`, {
            id: charlatan.Lorem.word(),
            name: charlatan.Lorem.word(),
            parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('language')
          });
          assert.strictEqual(res.status, 400);
          assert.strictEqual(res.body.error.id, 'invalid-operation');
        });

        it('[LVOF] must accept new prefixes in streams.update', async () => {
          const res = await putNew(`${basePath}/streams/${SystemStreamsSerializer.addPrivatePrefixToStreamId('language')}`, {
            content: charlatan.Lorem.characters(2)
          });
          assert.strictEqual(res.status, 400);
          assert.strictEqual(res.body.error.id, 'invalid-operation');
        });

        it('[C73R] must return new prefixes in streams.delete', async () => {
          const res = await delNew(`${basePath}/streams/${SystemStreamsSerializer.addPrivatePrefixToStreamId('language')}`);
          assert.strictEqual(res.status, 400);
          assert.strictEqual(res.body.error.id, 'invalid-operation');
        });
      });

      describe('[BW16] accesses', () => {
        it('[O9OH] must return new prefixes in accesses.get', async () => {
          const res = await getNew(`${basePath}/accesses/`, {
            includeExpired: true,
            includeDeletions: true
          });
          const accesses = res.body.accesses;
          assert.ok(accesses);
          for (const access of accesses) {
            if (access.permissions == null) continue;
            for (const permission of access.permissions) {
              checkNewPrefix(permission.streamId);
            }
          }
          const deletions = res.body.accessDeletions;
          if (deletions) {
            for (const access of deletions) {
              if (access.permissions == null) continue;
              for (const permission of access.permissions) {
                checkNewPrefix(permission.streamId);
              }
            }
          }
        });

        it('[GFRT] must accept new prefixes in accesses.create', async () => {
          const res = await postNew(`${basePath}/accesses/`, {
            name: charlatan.Lorem.characters(10),
            permissions: [{
              streamId: SystemStreamsSerializer.addPrivatePrefixToStreamId('invitationToken'),
              level: 'read'
            }],
            clientData: { something: 'hi' }
          });
          assert.strictEqual(res.status, 400);
          assert.strictEqual(res.body.error.id, 'invalid-operation');
        });
      });
    });
  });
});
