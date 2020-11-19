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


describe('events.get querying streams', function () {


  describe('Internal query helpers', function () {
    const fakeExpand = function(stream) {
      return [stream, 'X'];
    }

    const fakeRegisterStream = function(stream) {
      return true;
    }

    describe('removeSugarAndCheck', function() {

      it('[OJ3D] must pack initial [] in {OR: []}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck(['A','B'], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"OR":[{"IN":["A","X"]},{"IN":["B","X"]}]});
      });

      it('[O8ZD] must convert "B" in {EXPAND: "B"}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{ EQUAL: 'A' },'B'], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"OR":[{"EQUAL":"A"},{"IN":["B","X"]}]});
      });

      it('[O9ZD] must convert "B" in {EXPAND: "B"}', async function () {
        const res = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], 'C']}], fakeExpand, fakeRegisterStream);
        assert.deepEqual(res, {"AND":[{"OR":[{"IN":["A","X"]},{"IN":["B","X"]}]},{"IN":["C","X"]}]});
      });

    });

    describe('toMongoQuery', function() {

      it('[6UID] convert to MongoDB including expansion', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck(['A','B'], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$or":[{"streamIds":{"$in":["A","X"]}},{"streamIds":{"$in":["B","X"]}}]});
      });

      it('[ZOBS] convert to MongoDB including expansion with and', async function () {
        
        const clean = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], 'C']}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","X"]}},{"streamIds":{"$in":["B","X"]}}]},{"streamIds":{"$in":["C","X"]}}]});
      });

      it('[ZOBZ] convert to MongoDB including expansion with and and EQUAL', async function () {
        const clean = queryStreamFiltering.removeSugarAndCheck([{ AND: [['A','B'], {EQUAL: 'C'}]}], fakeExpand, fakeRegisterStream);
        const mongo = queryStreamFiltering.toMongoDBQuery(clean);
        assert.deepEqual(mongo, {"$and":[{"$or":[{"streamIds":{"$in":["A","X"]}},{"streamIds":{"$in":["B","X"]}}]},{"streamIds":"C"}]});
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

    let user,
        username,
        streams,
        events,
        tokenRead,
        basePathEvent;

    before(async function () {
      username = cuid();
      streams = {A: {}, B: {parentId: 'A'}, C: {parentId: 'A'}, D: {}, E: {parentId: 'D'}, F: {parentId: 'D'}};
      events = {
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
  
      tokenRead = cuid();
      basePathEvent = `/${username}/events/`;

      user = await mongoFixtures.user(username, {});
      
      for (const key of Object.keys(streams)) {
        streams[key].id = key;
        streams[key].name = 'stream ' + key;
        await user.stream(streams[key]);
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
      for (const key of Object.keys(events)) {
        events[key].type = 'note/txt',
        events[key].content = key,
        events[key].id = cuid(),
        await user.event(events[key]);
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
