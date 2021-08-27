/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { assert } = require('chai');

const { toSQLiteQuery } = require('audit/src/storage/sqLiteStreamQueryUtils');


describe('toSqliteQuery()', function() {

  it('[YS6Y] must convert to SQLLite including expansion', async function () {
    const clean = [{ any: ['A', 'B', 'C']}];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '("A" OR "B" OR "C")');
  });

  it('[R8I5] must convert to SQLLite including with "ALL"', async function () {
    const clean = [{ any: ['B']}];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '"B"');
  });

  it('[SGO5] must convert to SQLLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [{ any: ['A'], and: ['D'] }];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '"A" AND "D"');
  });

  it('[RPGX] must convert to SQLLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [{ any: ['A'], and: { any: ['D', 'E']} }];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '"A" AND ("D" OR "E")');
  });

  it('[EWLK] must convert to SQLLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [{ any: ['A'], and: ['D','F'] }];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '"A" AND "D" AND "F"');
  });

  it('[1FYY] must convert to SQLLite including expansion with "NOT"', async function () {
    const clean = [{any: ['A', 'B'], not: ['E']}];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '("A" OR "B") NOT "E"');
  });

  it('[3TTK] must convert to SQLLite including expansion with "ALL" and "NOT"', async function () {
    const clean = [{any: ['A', 'E'], and: ['D', 'C'], not: ['D', 'F']}];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '("A" OR "E") AND "D" AND "C" NOT "D" NOT "F"');
  });

  it('[1ZJU] must handle array of queries', async function () {
    const clean = [{any: ['B']},{and: ['D'] , not: ['E']}];
    const sqllite = toSQLiteQuery(clean);      
    assert.deepEqual(sqllite, '("B") OR ("D" NOT "E")');
  });
});