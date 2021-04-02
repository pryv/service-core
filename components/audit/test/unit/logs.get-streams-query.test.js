/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { assert } = require('chai');

const { toSQLLiteQuery } = require('../../src/storage/sqlliteStreamQueryUtils');


describe('toSqliteQuery()', function() {

  it('must convert to SQLLite including expansion', async function () {
    const clean = [{ any: ['A', 'B', 'C']}];
    const sqllite = toSQLLiteQuery(clean);      
    assert.deepEqual(sqllite, '("A" OR "B" OR "C")');
  });

  it('must convert to SQLLite including with "ALL"', async function () {
    const clean = [{ any: ['B']}];
    const sqllite = toSQLLiteQuery(clean);      
    assert.deepEqual(sqllite, '"B"');
  });

  it('must convert to SQLLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [{ any: ['A'], all: ['D','F'] }];
    const sqllite = toSQLLiteQuery(clean);      
    assert.deepEqual(sqllite, '"A" AND "D" AND "F"');
  });

  it('must convert to SQLLite including expansion with "NOT"', async function () {
    const clean = [{any: ['A', 'B'], not: ['E']}];
    const sqllite = toSQLLiteQuery(clean);      
    assert.deepEqual(sqllite, '("A" OR "B") NOT "E"');
  });

  it('must convert to SQLLite including expansion with "ALL" and "NOT"', async function () {
    const clean = [{any: ['A', 'E'], all: ['D', 'C'], not: ['D', 'F']}];
    const sqllite = toSQLLiteQuery(clean);      
    assert.deepEqual(sqllite, '("A" OR "E") AND "D" AND "C" NOT "D" NOT "F"');
  });

  it('[1ZJU] must handle array of queries', async function () {
    const clean = [{any: ['B']},{all: ['D'] , not: ['E']}];
    const sqllite = toSQLLiteQuery(clean);      
    assert.deepEqual(sqllite, '("B") OR ("D" NOT "E")');
  });
});