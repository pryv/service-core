/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, after, afterEach, it */

require('./test-helpers');

const util = require('util');

const cuid = require('cuid');
const { assert } = require('chai');

const helpers = require('./helpers');
const validation = helpers.validation;

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

const queryStreamUtils = require('../src/methods/helpers/queryStreamUtils');
const event = require('../src/schema/event');

/**
 * Structures
 * A-----ad-a
 *  |-B--be-b
 *  |-C--fc-c
 * 
 * D-----ad-d
 *  |-E--be-e
 *  |-F--fc-f
 * 
 * T--t (trashed stream)
 * 
 * A,D => ad, be, fc, a, b, c, d, e, f
 * A,E => ad, be, fc, a, b, c, e
 * A,&B => be, b
 * A,&E => be
 * T => t
 */

const STREAMS = { A: {}, B: { parentId: 'A' }, C: { parentId: 'A' }, D: {}, E: { parentId: 'D' }, F: { parentId: 'D' }, T: { trashed: true } };
const EVENTS = {
  ad: { streamIds: ['A', 'D'] },
  be: { streamIds: ['B', 'E'] },
  fc: { streamIds: ['F', 'C'] },
  a: { streamIds: ['A'] },
  b: { streamIds: ['B'] },
  c: { streamIds: ['C'] },
  d: { streamIds: ['D'] },
  e: { streamIds: ['E'] },
  f: { streamIds: ['F'] },
  t: { streamIds: ['T'] },
}
const EVENT4ID = {};

const ALL_ACCESSIBLE_STREAMS = [];
const ALL_AUTHORIZED_STREAMS = Object.keys(STREAMS);

// add childrens to STREAMS, fill ALL_ACCESSIBLE_STREAMS;
ALL_AUTHORIZED_STREAMS.forEach((streamId) => {
  const parentId = STREAMS[streamId].parentId;
  if (parentId) {
    if (!STREAMS[parentId].childrens) STREAMS[parentId].childrens = [];
    STREAMS[parentId].childrens.push(streamId);
  }
  if (STREAMS[streamId].trashed !== true) {
    ALL_ACCESSIBLE_STREAMS.push(streamId);
  }
});

/**
 * Mimics treeUtils.expandIds()
 * Different because we store STREAMS in a different format here
 */
function customExpand(streamId) {
  if (!STREAMS[streamId]) return [];
  const res = [streamId];
  if (STREAMS[streamId].childrens) {
    STREAMS[streamId].childrens.map((childId) => {
      const expanded = customExpand(childId);
      res.push(...expanded);
    });
  }
  return res;
}

describe('events.get streams query', function () {

  describe('Internal query helpers', function () {

    function validateQuery(query) {
      if (! Array.isArray(query)) query = [query];
      query = queryStreamUtils.transformArrayOfStringsToStreamsQuery(query);
      queryStreamUtils.validateStreamsQuery(query);
      const { streamQuery } = queryStreamUtils.checkPermissionsAndApplyToScope(query, customExpand, ALL_AUTHORIZED_STREAMS, ALL_ACCESSIBLE_STREAMS);
      return streamQuery;
    }

    describe('checkPermissionsAndApplyToScope', function () {

      it('[D2B5] must convert initial [] in {any: []}', async function () {
        const res = validateQuery(['A', 'B']);
        assert.deepEqual(res, [{ any: ['A', 'B', 'C'] }]);
      });

      it('[JZWE] must convert "B" in {any: ["B"]} (alongside a random selector)', async function () {
        const res = validateQuery('B');
        assert.deepEqual(res, [{ any: ['B'] }]);
      });

      it('[8VV4] must accept object queries and convert it to array)', async function () {
        const res = validateQuery({ any: ['A', 'B']});
        assert.deepEqual(res, [{ any: ['A', 'B', 'C']}]);
      });

      it('[HFT2] must convert "all" to "and: [{any..}, {any..}])', async function () {
        const res = validateQuery({ any: ['A'], all: ['D','F'] });
        assert.deepEqual(res, [
          { any: ['A', 'B', 'C'], 
            and: [
              {any: ['D', 'E', 'F']}, 
              {any: ['F']}
            ]
          }]);
      });

      it('[2W2K] must accept two queries', async function () {
        const res = validateQuery([{ any: ['A'] }, { any: ['D'] }]);
        assert.deepEqual(res, [{ any: ['A', 'B', 'C'] }, { any: ['D', 'E', 'F'] }]);
      });

      it('[2EF9] must convert {any: "*"} in {any: Accessible streams}', async function () {
        const res = validateQuery({ any: '*' });
        assert.deepEqual(res, [{ any: ALL_ACCESSIBLE_STREAMS }]);
      });

      it('[TUZT] must convert {any: [*], not: ["A"]} in {any: .. and .. not: ["A", "B", "C"]}', async function () {
        const res = validateQuery({ any: '*', not: ['A'] });
        assert.deepEqual(res, [{ any: ALL_ACCESSIBLE_STREAMS, and: [ { not: [ 'A', 'B', 'C' ] } ] }]);
      });

      it('[NHGF] must convert {any: [*], all: ["D"], not: ["B"]} in {any: .. and ..[ any.. , not: ["A", "B", "C"]}', async function () {
        const res = validateQuery({ any: '*', all: ['D'], not: ['A'] });
        assert.deepEqual(res, [{ 
          any: ALL_ACCESSIBLE_STREAMS, 
          and: [ 
            { any: [ 'D', 'E', 'F' ] }, 
            { not: [ 'A', 'B', 'C' ] } 
          ]
        }]);
      });


      it('[N3Q6] must convert {any: "*", not: ["A"]} in {any: Accessible streams, not: ["A", "B", "C"]}', async function () {
        const res = validateQuery({ any: '*', not: ['A'] });
        assert.deepEqual(res, [{ any: ALL_ACCESSIBLE_STREAMS, and: [ { not: [ 'A', 'B', 'C' ] } ] }]);
      });


      it('[L89B] must return null if query is empty', async function () {
        const res = validateQuery({ any: ['T'], not: ['A'] });
        assert.deepEqual(res, null);
      });
    });

    describe('exception and errors', function () {

      it('[9907] handles not existent stream {any: ["Z"]}', async function () {
        const query = validateQuery({ any: ['Z'] });
        assert.deepEqual(query, null);
        const mongo = queryStreamUtils.toMongoDBQuery(query);
        // empty call
        assert.deepEqual(mongo, { streamIds: { '$in': [] } });
      });


      it('[IOLA] must throw on malformed expressions', async function () {
        const malformed = {
          'streams queries and streamIds cannot be mixed': [
            ['A', { any: ['A', 'B'] }],
          ],
          'must contain at least one of "any" or "all"': [
            { not: ['A', 'B'] },
          ],
          'unkown property': [
            { all: ['A', 'B'], zz: ['A'] },
          ],
          'must be an array': [
            // only array strings (streamIds)
            { any: {all: 'B'} },
            { all: true },
            { any: '*', not: 'B' },
          ],
          'must be streamIds': [
            // only array strings (streamIds)
            { any: ['A', 'B', { all: 'Z' }] },
            { all: ['A', 'B', true] },
            { any: '*', not: ['A', 'B', ['A']] },
          ]
        };

        for (const [error, streamsQueries] of Object.entries(malformed)) {
          streamsQueries.map((streamsQuery) => {
            let hasThrown = false;
            try {
              const query = validateQuery(streamsQuery);
            } catch (e) {
              hasThrown = true;
              assert.include(e, error);
            };
            if (!hasThrown) throw ('checkPermissionsAndApplyToScope was expected to throw [' + error + '] with query: <<' + JSON.stringify(streamsQuery) + '>>');
          });
        };
      });

    });

    
    describe('toMongoQuery()', function() {

      it('[KKIH] must convert to MongoDB including expansion', async function () {
        const clean = validateQuery(['A','B']);
        const mongo = queryStreamUtils.toMongoDBQuery(clean);
       
        assert.deepEqual(mongo, { streamIds: { '$in': [ 'A', 'B', 'C' ] } });
      });

      it('[4QMR] must convert to MongoDB including with "ALL"', async function () {
        const clean = validateQuery({any: ['A', 'B'], all: ['E']});
        const mongo = queryStreamUtils.toMongoDBQuery(clean);
        
        assert.deepEqual(mongo, { streamIds: { '$in': [ 'A', 'B', 'C' ]}, '$and': [ { streamIds: { '$eq': 'E' } } ] });
      });

      it('[NG7F] must convert to MongoDB including expansion with "NOT"', async function () {
        const clean = validateQuery({any: ['A', 'B'], not: ['E']});
        const mongo = queryStreamUtils.toMongoDBQuery(clean);
        
        assert.deepEqual(mongo, { 
          streamIds: { '$in': [ 'A', 'B', 'C' ]}, 
          '$and': [ { streamIds: { '$ne': 'E' } } ] });
      });

      it('[HC6X] must convert to MongoDB including expansion with "ALL" and "NOT"', async function () {
        const clean = validateQuery({any: ['A', 'E'], all: ['D', 'C'], not: ['D', 'F']});
        const mongo = queryStreamUtils.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {
          streamIds: { '$in': [ 'A', 'B', 'C', 'E' ] },
          '$and': [
            { streamIds: { '$in': [ 'D', 'E', 'F' ] } },
            { streamIds: { '$eq': 'C' } },
            { streamIds: { '$nin': [ 'D', 'E', 'F' ] } },
            { streamIds: { '$ne': 'F' } }
          ]
        });
      });

      it('[1ZJU] must handle array of queries', async function () {
        const clean = validateQuery([{any: ['B']},{all: ['D'] , not: ['E']}]);
        const mongo = queryStreamUtils.toMongoDBQuery(clean);
        const expected = {
          '$or': [
            { streamIds: { '$eq': 'B' } },
            {
              '$and': [
                { streamIds: { '$in': [ 'D', 'E', 'F' ] } },
                { streamIds: { '$ne': 'E' } }
              ]
            }
          ]
        };
        assert.deepEqual(mongo, expected);
      });
    });
  });


  describe('GET /events with streams queries', function () {
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
      tokenRead,
      basePathEvent,
      basePath;

    before(async function () {
      username = cuid();
      tokenRead = cuid();
      basePath = `/${username}`;
      basePathEvent = `${basePath}/events/`;

      user = await mongoFixtures.user(username, {});

      for (const [streamId, streamData] of Object.entries(STREAMS)) {
        const stream = {
          id: streamId,
          name: 'stream ' + streamId,
          parentId: streamData.parentId,
          trashed: streamData.trashed
        }
        await user.stream(stream);
      };

      await user.access({
        type: 'app',
        token: tokenRead,
        permissions: [
          {
            streamId: '*',
            level: 'read'
          }
        ]
      });
      for (const [key, event] of Object.entries(EVENTS)) {
        event.type = 'note/txt',
          event.content = key,
          event.id = cuid(),
          EVENT4ID[event.id] = key;
        await user.event(event);
      };

    });
    after(async () => {
      await mongoFixtures.clean();
    });

    it('[NKH8] must accept simple string converting it to array (because of some creepy HTTP client)', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: 'A' });
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 6);
      events.forEach(e => {
        let isFound = false;
        customExpand('A').forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isTrue(isFound);
      });
    });

    it('[BW6Z] must accept array of string', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: ['A', 'D'] });
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 9);
      events.forEach(e => {
        let isFound = false;
        const streamIds = customExpand('A').concat(customExpand('D'));
        streamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isTrue(isFound);
      });
    });

    it('[HFA2] must accept {"not": ["D"]} without including items in trashed streams', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: JSON.stringify({ any: '*', not: ['D'] }) });
      const events = res.body.events;
      assert.equal(events.length, 3);
      events.forEach(e => {
        let isFound = false;
        const streamIds = customExpand('A');
        streamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isTrue(isFound);
        isFound = false;
        const badStreamIds = customExpand('D').concat('T');
        badStreamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isFalse(isFound);
      });
    });

    it('[MMB0] must accept !B && !E without including items in Trashed streams', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: JSON.stringify({ any: "*", not: ['B','E']}) });
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 6);
      events.forEach(e => {
        let isFound = false;
        const streamIds = ['A', 'C', 'D', 'F']
        streamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isTrue(isFound);
        isFound = false;
        const badStreamIds = ['B', 'E', 'T'];
        badStreamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isFalse(isFound);
      });
    });

    it('[VUER] must return events in A AND E', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: JSON.stringify({ all: ['A', 'E'] }) });
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 1);
      events.forEach(e => {
        let isFoundA = false;
        let isFoundE = false;
        const streamIds = customExpand('A');
        streamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFoundA = true;
        });
        assert.isTrue(isFoundA);
        assert.isTrue(e.streamIds.includes('E'));
      });
    });

    it('[CBP2] must return events in A AND NOT B', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: JSON.stringify({ all: ['A'], not: ['B'] }) });

      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 4);
      events.forEach(e => {
        let isFound = false;
        const streamIds = ['A', 'C']
        streamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isTrue(isFound);
        assert.isFalse(e.streamIds.includes('B'));
      });
    });

    it('[I19H] must return events in A AND NOT in D', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: JSON.stringify({ any: ['A'], not: ['D']}) });
      
      assert.exists(res.body.events)
      const events = res.body.events;
      const expectedEvents = ['b', 'a', 'c'];
      assert.equal(events.length, expectedEvents.length);
      const resIds = events.map((e) => {
        assert.exists(EVENT4ID[e.id]);
        assert.include(expectedEvents, EVENT4ID[e.id]);
      });
    });

    it('[55HB] must return events in A AND NOT-EQUAL D)', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({ streams: JSON.stringify({ any: ['A'], not: ['#D']}) });
      assert.exists(res.body.events)
      const events = res.body.events;
      const expectedEvents = ['a', 'b', 'fc', 'c', 'be'];
      assert.equal(events.length, expectedEvents.length);
      const resIds = events.map((e) => {
        assert.exists(EVENT4ID[e.id]);
        assert.include(expectedEvents, EVENT4ID[e.id]);
      });
    });

    it('[O4DJ] must return all events in B || (D && !E)', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({
          streams: JSON.stringify([{any: ['B']}, { any: ['D'], not: ['E']}])
        });
      assert.exists(res.body.events)
      const events = res.body.events;

      assert.equal(events.length, 6);

      events.forEach(e => {
        if (e.streamIds.includes('B')) return;

        let isFound = false;
        const streamIds = ['D', 'F']
        streamIds.forEach(streamId => {
          if (e.streamIds.includes(streamId)) isFound = true;
        });
        assert.isTrue(isFound);
        assert.isFalse(e.streamIds.includes('E'));
      });
    });

    it('[UJSB] should allow object in batch call', async function () {
      //['B',{AND: ['D', {NOTEQUAL: 'E'}]}]
      const res = await server.request()
        .post(basePath)
        .set('Authorization', tokenRead)
        .send([
          {
            method: 'events.get',
            params: {
              streams: { any: ['D'], not: ['E']}
            }
          }
        ]);
      assert.exists(res.body.results);
      assert.exists(res.body.results[0].events);
      const events = res.body.results[0].events;
      assert.equal(events.length, 4);
    });

    describe('edge cases', () => {
      it('[X8B1] must return an error on non-existing stream', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({ streams: JSON.stringify({ any: ['A', 'Z', 'B'] }) });
        assert.exists(res.body.error);
        assert.equal(res.body.error.id, 'unknown-referenced-resource');
      });

      it('[30NV] must return error when provided a boolean instead of an expression', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({ streams: JSON.stringify({ any:  ['A', 'Z', true] }) });
        assert.exists(res.body.error);
        assert.equal(res.body.error.id, 'invalid-request-structure');
      });

      it('[YOJ9] must return error when provided a null instead of an expression', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({ streams: JSON.stringify([null, { any:  ['A', 'Z'] }]) });
        assert.exists(res.body.error);
        assert.equal(res.body.error.id, 'invalid-request-structure');
      });

      it('[3X9I] must return an empty list when provided a trashed streamId', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({ streams: ['T'] });

        assert.equal(res.body.events.length, 0);
      });

    });

  });
});
