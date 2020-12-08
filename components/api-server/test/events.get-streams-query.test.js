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
const { assert} = require('chai');

const helpers = require('./helpers');
const validation = helpers.validation;

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

const queryStreamFiltering = require('../src/methods/helpers/queryStreamFiltering');
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

const STREAMS = {A: {}, B: {parentId: 'A'}, C: {parentId: 'A'}, D: {}, E: {parentId: 'D'}, F: {parentId: 'D'}, T: {trashed: true}};
const EVENTS = {
  ad: {streamIds: ['A','D']},
  be: {streamIds: ['B','E']},
  fc: {streamIds: ['F','C']},
  a:  {streamIds: ['A']},
  b:  {streamIds: ['B']},
  c: {streamIds: ['C']},
  d: {streamIds: ['D']},
  e: {streamIds: ['E']},
  f: {streamIds: ['F']},
  t: {streamIds: ['T']},
}
const EVENT4ID = {};

// add childrens to STREAMS
Object.keys(STREAMS).map((streamId) => { 
  const parentId = STREAMS[streamId].parentId;
  if (parentId) {
    if (! STREAMS[parentId].childrens)  STREAMS[parentId].childrens = [];
    STREAMS[parentId].childrens.push(streamId);
  }
});

/**
 * Mimics treeUtils.expandIds()
 * Different because we store STREAMS in a different format here
 */
function customExpand(streamId /*, isInclusive*/) {
  if (! STREAMS[streamId]) return [];
  const res = [streamId];
  if (STREAMS[streamId].childrens) {
    STREAMS[streamId].childrens.map((childId) => {
      const expanded =  customExpand(childId);
      res.push(...expanded);
    });
  }
  return res;
}

describe('events.get querying streams', function () {

  describe('Internal query helpers', function () {

    function isAuthorized(streamId) {
      if (! STREAMS[streamId]) return false;
      return true;
    }

    function isAccessible(streamId) {
      if (! STREAMS[streamId]) return false;
      return true;
    }

    function validateQuery(query) {
      const {streamQuery} = queryStreamFiltering.validateStreamQuery(query, customExpand, isAuthorized, isAccessible);
      return streamQuery;
    }

    describe('validateStreamQuery()', function() {

      it('[D2B5] must convert root array [] to {OR: [IN, IN]}', async function () {
        const res = validateQuery(['A','B']);
        assert.deepEqual(res, {"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]});
      });

      it('[JZWE] must convert "B" to {EXPAND: "B"} (alongside another expression)', async function () {
        const res = validateQuery([{ EQUAL: 'A' },'B']);
        assert.deepEqual(res, {"OR":[{"EQUAL":"A"},{"IN":["B"]}]});
      });

      it('[8VV4] must convert "A", "B" and "C" in {EXPAND: "B"} (alongside a random selector)', async function () {
        const res = validateQuery({ AND: [['A','B'], 'C']});
        assert.deepEqual(res, {"AND":[{"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]},{"IN":["C"]}]});
      });

      it('[2W2K] must convert {EXPAND: "A"} to {IN: ["A", "B", "C"]}', async function () {
        const res = validateQuery({EXPAND: 'A'});
        assert.deepEqual(res, {IN: ["A", "B", "C"]});
      });

      it('[2EF9] must convert {NOTEXPAND: "A"} to {NOTIN: ["A", "B", "C"]}', async function () {
        const res = validateQuery({NOTEXPAND: 'A'});
        assert.deepEqual(res, {NOTIN: ["A", "B", "C"]});
      });


      it('[N3Q6] must convert {NOT: ["A"]} to {OR: [{NOTIN: ["A", "B", "C"]}]}', async function () {
        const res = validateQuery({NOT: ['A']});
        assert.deepEqual(res, {OR: [{NOTIN: ["A", "B", "C"]}]});
      });

      it('[BSWA] must not convert {IN: ["A"]}', async function () {
        const res = validateQuery({IN: ['A']});
        assert.deepEqual(res, {IN: ["A"]});
      });

      it('[M7AC] must convert {AND: [["A", ["B"]]]} to {AND [IN, {OR [IN IN]}]}', async function () {
        const res = validateQuery({AND: ["D", ["B", "C"]]});
        assert.deepEqual(res, {"AND":[{"IN":["D","E","F"]},{"OR":[{"IN":["B"]},{"IN":["C"]}]}]});
      });

    });

    describe('exception and errors', function() {
  
      it('[9907] handles not existent stream {OR: ["Z"]}', async function () {
        const query = validateQuery({OR: ['Z']});
        assert.deepEqual(query, null);
        const mongo = queryStreamFiltering.toMongoDBQuery(query);
        assert.deepEqual(mongo, null);
      });

      it('[J9E2] handles not existent stream in array ["U", "Z", "T"]', async function () {
        const query = validateQuery(['A','Z','B']);
        assert.deepEqual(query, {"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]});
      });

      it('[K9H2] handles not existent stream in array to be expanded {OR: ["A", "Z", "B"]}', async function () {
        const query = validateQuery({OR: ['A','Z','B']});
        assert.deepEqual(query, {"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]});
        const mongo = queryStreamFiltering.toMongoDBQuery(query);
        assert.deepEqual(mongo, {"streamIds":{"$in":["A","B","C"]}});
      });

      it('[B8HC] handles not existent stream in array or equality {IN: ["A", "Z", "B"]}', async function () {
        const query = validateQuery({IN: ['A','Z','B']});
        assert.deepEqual(query, {"IN":["A","B"]});
        const mongo = queryStreamFiltering.toMongoDBQuery(query);
        assert.deepEqual(mongo, {"streamIds":{"$in":["A","B"]}});
      });

      it('[IOLA] must throw on malformed expressions', async function () {
        const malformed = {
          'operator must only contain arrays of strings': [
            // only array strings (streamIds)
            {IN: ['A','B',{OR: 'Z'}]},
            {NOTIN: ['A','B',{OR: 'Z'}]},
            {NOTIN: ['A','B',{OR: 'Z'}]},
            {NOT: ['A','B',{OR: 'Z'}]}
          ],
          'operator must only be used with strings': [
            // only array strings (streamIds)
            {EQUAL: ['A']},
            {NOTEQUAL: ['A']},
            {EXPAND: ['A']},
            {NOTEXPAND: ['A']}
          ],
          'operator must only be used with arrays': [
            // only array strings (streamIds)
            {OR: 'A'},
            {AND: 'A'}
          ],
          'Unkown operator': [
            {ZZ: 'A'}
          ],
          'Unkown expression': [
            true,
            1
          ]
        };

        for (const [error, streamsQueries] of Object.entries(malformed)) {
          streamsQueries.map((streamsQuery) => {
            let hasThrown = false;
            try {
              const query = validateQuery(streamsQuery);
            } catch (e) {
              hasThrown = true;
              assert.include(e,error);
            };
            if (! hasThrown) throw('validateStreammQuery was expected to throw [' + error + '] with query: <<' + JSON.stringify(streamsQuery) + '>>');
          });
        };
      });

    });

    describe('toMongoQuery()', function() {

      it('[KKIH] must convert to MongoDB including expansion', async function () {
        const clean = validateQuery(['A','B']);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, false);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]});
        assert.deepEqual(optimized, {"streamIds":{"$in":["A","B","C"]}});
      });

      it('[4QMR] must convert to MongoDB including expansion with "AND"', async function () {
        const clean = validateQuery({ AND: [['A','B'], 'E']});
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, false);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]},{"streamIds":{"$in":["E"]}}]});
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":"E"}]});
      });

      it('[V822] must convert {NOT: ["A"]} to {OR: {NOTIN: ["A", "B", "C"]}}', async function () {
        const clean = validateQuery({NOT: ['A']});
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, false);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, { '$or': [ { streamIds: { '$nin': [ 'A', 'B', 'C' ] } }] });
        assert.deepEqual(optimized, { streamIds: { '$nin': [ 'A', 'B', 'C' ] } });
      });

      it('[AHRK] must convert to MongoDB including expansion with "AND" and "EQUAL"', async function () {
        const clean = validateQuery({ AND: [['A','B'], {EQUAL: 'D'}]});
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, false);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]},{"streamIds":"D"}]});
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":"D"}]});
      });

      it('[P5M8] must convert to MongoDB including expansion with "AND" and "NOTEXPAND"', async function () {
        const clean = validateQuery({AND: ['A', {NOTEXPAND: 'D'}]});
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(optimized, {"$and":[{ streamIds: { '$in': [ 'A', 'B', 'C' ] } },{ streamIds: { '$nin': [ 'D', 'E', 'F' ] } }]});
      });


      it('[1ZJU] must handle complex nested queries', async function () {
        const clean = validateQuery(['B',{AND: ['D', {NOTEQUAL: 'E'}]}]);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        const expected = {
          '$or': [
            {
              '$and': [
                { streamIds: { '$in': [ 'D', 'E', 'F' ] } },
                { streamIds: { '$ne': 'E' } }
              ]
            },
            { streamIds: 'B' }
          ]
        };
        assert.deepEqual(optimized, expected);
      });

      it('[E4QF] must convert {AND: [["A", ["B"]]]} to {AND [IN, {OR [IN IN]}]}', async function () {
        const clean = validateQuery({AND: ["D", ["B", "C"]]});
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["D","E","F"]}},{"streamIds":{"$in":["B","C"]}}]});
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
        .query({streams: 'A'});
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
        .query({streams: ['A','D']});
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

    it('[HFA2] must accept {"NOT": ["D"]} without including items in trashed streams', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify({NOT: ['D']})});
      assert.exists(res.body.events)
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
        .query({streams: JSON.stringify({AND: [{NOT: ['B']}, {NOT: ['E']}]})});
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
        .query({streams: JSON.stringify({AND: ['A', 'E']})});
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
        .query({streams: JSON.stringify({AND: ['A', {NOT: ['B']}]})});
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

    it('[I19H] must return events in A AND NOTEXPAND in D', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify({AND: ['A', {NOTEXPAND: 'D'}]})});
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
        .query({streams: JSON.stringify({AND: ['A', {NOTEQUAL: 'D'}]})});
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
        .query({streams: JSON.stringify(
            {OR: [
              'B', 
              {AND: ['D', {NOT: ['E']}]}
            ]}
            )});
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
              streams: {OR: [['B'], {AND: ['D', {NOT: ['E']}]}]}
            }
          }
        ]);
      assert.exists(res.body.results);
      assert.exists(res.body.results[0].events);
      const events = res.body.results[0].events;
      
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

    describe ('edge cases', () => { 
      it('[X8B1] must return an error on non-existing stream', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({streams: JSON.stringify({AND: ['A', 'Z', 'B']})});
        assert.exists(res.body.error);
        assert.equal(res.body.error.id, 'unknown-referenced-resource');
      });

      it('[30NV] must return error when provided a boolean instead of an expression', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({streams: JSON.stringify({AND: [['A', 'Z'], true]})});
        assert.exists(res.body.error);
        assert.equal(res.body.error.id, 'invalid-request-structure');
      });

      it('[YOJ9] must return error when provided a null instead of an expression', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({streams: JSON.stringify({AND: [['A', [null]]]})});
        assert.exists(res.body.error);
        assert.equal(res.body.error.id, 'invalid-request-structure');
      });

      it('[3X9I] must return an empty list when provided a trashed streamId', async function () {
        const res = await server.request()
          .get(basePathEvent)
          .set('Authorization', tokenRead)
          .query({streams: ['T']});
 
        assert.equal(res.body.events.length, 0);
      });

    });

  });
});
