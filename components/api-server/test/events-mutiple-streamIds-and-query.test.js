/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, beforeEach, after, afterEach, it */

require('./test-helpers');

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

      it('[ZOBZ] convert to MongoDB including expansion with and and EQUAL', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], {EQUAL: 'D'}]}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean, true);
        const optimized = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":{"$in":["B"]}}]},{"streamIds":"D"}]});
        assert.deepEqual(optimized, {"$and":[{"streamIds":{"$in":["A","B","C"]}},{"streamIds":"D"}]});
      });

    });

  });

  describe('AND streamIds', function () {
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
        basePathEvent;

    before(async function () {
      username = cuid();
      
  
      tokenRead = cuid();
      basePathEvent = `/${username}/events/`;

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


    it('[MAGD] must return events in A AND E', async function () {
      const res = await server.request()
        .get(basePathEvent)
        .set('Authorization', tokenRead)
        .query({streams: ['A', 'B']});
    });


  });
});
