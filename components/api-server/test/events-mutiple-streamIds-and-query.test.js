/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, after, afterEach, it */

require('./test-helpers');

const util = require("util");
function logItem() {
  for(let i = 0; i < arguments.length; i++) {
    console.log(util.inspect(arguments[i], {depth: 12, colors: true}));
  }
}

const ErrorIds = require('components/errors').ErrorIds;
const url = require('url');
const _ = require('lodash');
const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');

const helpers = require('./helpers');
const validation = helpers.validation;

const {fixturePath, fixtureFile} = require('./unit/test-helper');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

const queryStreamFiltering = require('../src/methods/helpers/queryStreamFiltering');

require('date-utils');


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
 * A,D => ad, be, fc, a, b, c, d, e, f
 * A,E => ad, be, fc, a, b, c, e
 * A,&B => be, b
 * A,&E => be
 */

const STREAMS = {A: {}, B: {parentId: 'A'}, C: {parentId: 'A'}, D: {}, E: {parentId: 'D'}, F: {parentId: 'D'}};
const EVENTS = {
  ad: {streamIds: ['A','D']},
  be: {streamIds: ['B','E']},
  fc: {streamIds: ['F','C']},
  a:  {streamIds: ['A']},
  b:  {streamIds: ['B']},
  c: {streamIds: ['C']},
  d: {streamIds: ['D']},
  e: {streamIds: ['E']},
  f: {streamIds: ['E']}
}

// add childrens to STREAMS
Object.keys(STREAMS).map((streamId) => { 
  const parentId = STREAMS[streamId].parentId;
  if (parentId) {
    if (! STREAMS[parentId].childrens)  STREAMS[parentId].childrens = [];
    STREAMS[parentId].childrens.push(streamId);
  }
});

/** 
 * helper to expand streams 
 * mimics treeUtils.expandIds()
 * */
function getExpandedStreams(streamId) {
  if (! STREAMS[streamId]) return [];
  const res = [streamId];
  if (STREAMS[streamId].childrens) {
    STREAMS[streamId].childrens.map((childId) => {
      const expanded =  getExpandedStreams(childId);
      res.push(...expanded);
    });
  }
  return res;
}

describe('events.get querying streams', function () {


  describe('Internal query helpers', function () {
    const fakeExpand = function(stream) {
      return getExpandedStreams(stream);
    }

    const fakeRegisterStream = function(streamId) {
      if (! STREAMS[streamId]) return false;
      return true;
    }

    describe('removeSugarAndCheck', function() {

      it('[OJ3D] must pack initial [] in {OR: []}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck(['A','B'], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]});
      });

      it('[O8ZD] must convert "B" in {EXPAND: "B"}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{ EQUAL: 'A' },'B'], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"OR":[{"EQUAL":"A"},{"IN":["B"]}]});
      });

      it('[O9ZD] must convert "A", "B" and "C" in {EXPAND: "B"}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], 'C']}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"AND":[{"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]},{"IN":["C"]}]});
      });

      it('[7ZGT] must convert {EXPAND: "A"} in {IN: ["A", "B", "C"]}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{EXPAND: 'A'}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {IN: ["A", "B", "C"]});
      });

      it('[7GRU] must convert {NOTEXPAND: "A"} in {NOTIN: ["A", "B", "C"]}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{NOTEXPAND: 'A'}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {NOTIN: ["A", "B", "C"]});
      });


      it('[67IU] must convert {NOT: ["A"]} in {OR: {NOTIN: ["A", "B", "C"]}}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{NOT: ['A']}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {OR: [{NOTIN: ["A", "B", "C"]}]});
      });


      it('[86UT] must not convert {IN: ["A"]}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{IN: ['A']}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {IN: ["A"]});
      });
    });

    describe('exception and errors', function() {
  
      it('[0UZT] handles not existent stream {OR: ["Z"]}', async function () {
        const query = queryStreamFiltering.removeSugarAndCheck([{OR: ['Z']}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(query, null);
        const mongo = queryStreamFiltering.toMongoDBQuery(query);
        //assert.mongo(query, {OR: []});
      });

    });

    describe('toMongoQuery', function() {

      it('[6UID] convert to MongoDB including expansion', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck(['A','B'], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, true);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]});
        assert.deepEqual(optimized, {"streamIds":{"$in":["A","B","C"]}});
      });

      it('[ZOBS] convert to MongoDB including expansion with and', async function () {
        
        const clean = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], 'E']}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, true);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]},{"streamIds":{"$in":["E"]}}]});
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":"E"}]});
      });

      it('[GZ8S] must convert {NOT: ["A"]} in {OR: {NOTIN: ["A", "B", "C"]}}', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{NOT: ['A']}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, true);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, { '$or': [ { streamIds: { '$nin': [ 'A', 'B', 'C' ] } }] });
        assert.deepEqual(optimized, { streamIds: { '$nin': [ 'A', 'B', 'C' ] } });
      });

      it('[UZBZ] convert to MongoDB including expansion with AND and EQUAL', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], {EQUAL: 'D'}]}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, true);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]},{"streamIds":"D"}]});
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":"D"}]});
      });

      it('[H75A] convert to MongoDB including expansion with AND and NOTEXPAND', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{AND: ['A', {NOTEXPAND: 'D'}]}], fakeExpand, fakeRegisterStream);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(optimized, {"$and":[{ streamIds: { '$in': [ 'A', 'B', 'C' ] } },{ streamIds: { '$nin': [ 'D', 'E', 'F' ] } }]});
      });


      it('[ZU7S] handle complex nested queries', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck(['B',{AND: ['D', {NOTEQUAL: 'E'}]}], fakeExpand, fakeRegisterStream);
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
    });

  });

  describe('query on streamIds', function () {
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
      
      for (const key of Object.keys(STREAMS)) {
        const stream = {
          id: key,
          name: 'stream ' + key,
          parentId: STREAMS[key].parentId
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
      for (const key of Object.keys(EVENTS)) {
        EVENTS[key].type = 'note/txt',
        EVENTS[key].content = key,
        EVENTS[key].id = cuid(),
        await user.event(EVENTS[key]);
      };
     
    });
    after(async () => {
      await mongoFixtures.clean();
    });

    it('[TXXD] convert simple string to array (because of some creppy HTTP client)', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: 'A'});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 6);
    });

    it('[TUGD] must accept array of string', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: ['A','D']});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 9);
    });

    it('[MAGD] must return events in A AND E', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify([{AND: ['A', 'E']}])});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 1);
      assert.equal(events[0].id, EVENTS['be'].id);
    });

    it('[J8HW] must return events in A AND NOTEXPAND B', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify([{AND: ['A', {NOTEXPAND: 'B'}]}])});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 4);
      const resEvents = ['a', 'fc', 'c', 'ad'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });

    it('[SH5F] must return events in A AND NOTEXPAND in D', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify([{AND: ['A', {NOTEXPAND: 'D'}]}])});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 3);
      const resEvents = ['c', 'a', 'b'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });


    it('[S7ZF] must return events in A AND NOT-EQUAL D)', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify([{AND: ['A', {NOTEQUAL: 'D'}]}])});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 5);
      const resEvents = ['a', 'b', 'fc', 'c', 'be'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });

    it('[O8SD] must return all events in B + events in D NOT-EQUAL E)', async function () {
      //['B',{AND: ['D', {NOTEQUAL: 'E'}]}]
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify(
            [{IN: ['B']}, {AND: ['D', {NOTEQUAL: 'E'}]}]
            )});
      assert.exists(res.body.events)
      const events = res.body.events;
      
      assert.equal(events.length, 5);
      const resEvents = ['a', 'b', 'fc', 'c', 'be'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });

    it('[75S7] should allow object in batch call', async function () {
      //['B',{AND: ['D', {NOTEQUAL: 'E'}]}]
      const res = await server.request()
        .post(basePath)
        .set('Authorization', tokenRead)
        .send([
          { 
            method: 'events.get',
            params: {
              streams: [{IN: ['B']}, {AND: ['D', {NOTEQUAL: 'E'}]}]
            }
          }
        ]);
      assert.exists(res.body.results);
      assert.exists(res.body.results[0].events);
      const events = res.body.results[0].events;
      
      assert.equal(events.length, 5);
      const resEvents = ['a', 'b', 'fc', 'c', 'be'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });

  });
});
