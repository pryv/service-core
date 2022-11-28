/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const { assert } = require('chai');

const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

/**
 * Structure
 * A-----ab-ac-a
 *  |-B--bc-ab-b
 *  | |-E-ea
 *  |
 *  |-C--bc-ac-c
 */

const STREAMS = {
  A: {}, B: { parentId: 'A' }, C: { parentId: 'A' }, E: { parentId: 'B' }
};
const EVENTS = {
  ab: { streamIds: ['A', 'B'] },
  ac: { streamIds: ['A', 'C'] },
  bc: { streamIds: ['B', 'C'] },
  ea: { streamIds: ['E', 'A'] },
  a: { streamIds: ['A'] },
  b: { streamIds: ['B'] },
  c: { streamIds: ['C'] }
};
const EVENT4ID = {}; // will be filled by fixtures

describe('permissions forcedStreams', function () {
  describe('GET /events with forcedStreams', function () {
    let server;
    before(async () => {
      server = await context.spawn();
    });
    after(() => {
      server.stop();
    });

    let mongoFixtures;
    before(async function () {
      mongoFixtures = databaseFixture(await produceMongoConnection());
    });

    let user,
      username,
      tokenForcedB,
      basePathEvent,
      basePath;

    before(async function () {
      username = cuid();
      tokenForcedB = cuid();
      basePath = `/${username}`;
      basePathEvent = `${basePath}/events/`;

      user = await mongoFixtures.user(username, {});

      for (const [streamId, streamData] of Object.entries(STREAMS)) {
        const stream = {
          id: streamId,
          name: 'stream ' + streamId,
          parentId: streamData.parentId,
          trashed: streamData.trashed
        };
        await user.stream(stream);
      }

      await user.access({
        type: 'app',
        token: tokenForcedB,
        permissions: [
          {
            streamId: '*',
            level: 'read'
          },
          {
            streamId: 'B',
            level: 'none'
          }
        ]
      });
      for (const [key, event] of Object.entries(EVENTS)) {
        event.type = 'note/txt';
        event.content = key;
        event.id = cuid();
        EVENT4ID[event.id] = key;
        await user.event(event);
      }
    });
    after(async () => {
      await mongoFixtures.clean();
    });

    it('[SO2E] must not see events  on "B" when querying *', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenForcedB)
        .query({ });
      assert.exists(res.body.events);
      const events = res.body.events;
      events.forEach(e => {
        let ebFound = false;
        for (const eb of ['E', 'B']) {
          if (e.streamIds.includes(eb)) ebFound = true;
        }
        assert.isFalse(ebFound);
      });
    });

    it('[ELFF] must refuse querying C', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenForcedB)
        .query({ streams: ['C'] });
      assert.exists(res.body.events);
      const events = res.body.events;
      events.forEach(e => {
        assert.include(e.streamIds, 'C');
        let ebFound = false;
        for (const eb of ['E', 'B']) {
          if (e.streamIds.includes(eb)) ebFound = true;
        }
        assert.isFalse(ebFound);
      });
    });
  });
});
