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

/** helper to expand streams */
function getExpandedStreams(streamId) {
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

    const fakeRegisterStream = function(stream) {
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

      it('[O9ZD] must convert "B" in {EXPAND: "B"}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], 'C']}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"AND":[{"OR":[{"IN":["A","B","C"]},{"IN":["B"]}]},{"IN":["C"]}]});
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

      it('[UZBZ] convert to MongoDB including expansion with AND and EQUAL', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], {EQUAL: 'D'}]}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, true);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]},{"streamIds":"D"}]});
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":"D"}]});
      });

      it('[H75A] convert to MongoDB including expansion with AND and NOT', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{AND: ['A', {NOT: 'D'}]}], fakeExpand, fakeRegisterStream);
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

    it('[J8HW] must return events in A AND NOT B', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify([{AND: ['A', {NOT: 'B'}]}])});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 4);
      const resEvents = ['a', 'fc', 'c', 'ad'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });

    it('[SH5F] must return events in A AND NOT in D', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: JSON.stringify([{AND: ['A', {NOT: 'D'}]}])});
      assert.exists(res.body.events)
      const events = res.body.events;
      assert.equal(events.length, 3);
      const resEvents = ['c', 'a', 'b'];
      for (let i; i < resEvents; i++) {
        assert.equal(events[i].id, EVENTS[resEvents[i]].id);
      }
    });


    it('[S7ZF] must return events in A AND NOT in (EQUAL D)', async function () {
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

    it('[O8SD] must return all events in B + events in D NOT in (EQUAL E)', async function () {
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

    

  });
});
