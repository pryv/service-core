/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Tags backward compatibility tests (Pattern C)
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
});
