/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { assert } = require('chai');

const { toSQLiteQuery } = require('../../src/userSQLite/streamQueryUtils');

describe('[USQL] userSQLite toSqliteQuery()', function () {
  it('[YS6Y] must convert to SQLite including expansion', async function () {
    const clean = [[{ any: ['A', 'B', 'C'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '("A" OR "B" OR "C")');
  });

  it('[R8I5] must convert to SQLite including with "ALL"', async function () {
    const clean = [[{ any: ['B'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '"B"');
  });

  it('[SGO5] must convert to SQLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [[{ any: ['A'] }, { any: ['D'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '"A" AND "D"');
  });

  it('[RPGX] must convert to SQLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [[{ any: ['A'] }, { any: ['D', 'E'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '"A" AND ("D" OR "E")');
  });

  it('[EWLK] must convert to SQLite  streams query property "all" to "and: [{any..}, {any..}]) with each containing expanded streamIds', async function () {
    const clean = [[{ any: ['A'] }, { any: ['D'] }, { any: ['F'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '"A" AND "D" AND "F"');
  });

  it('[1FYY] must convert to SQLite including expansion with "NOT"', async function () {
    const clean = [[{ any: ['A', 'B'] }, { not: ['E'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '("A" OR "B") NOT "E"');
  });

  it('[4QSG] must convert to SQLite including expansion with "AND" and "NOT"', async function () {
    const clean = [[
      { any: ['A', 'B', 'C'] },
      { any: ['F'] },
      { not: ['D', 'E', 'F'] },
      { not: ['E'] }
    ]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '("A" OR "B" OR "C") AND "F" NOT "D" NOT "E" NOT "F" NOT "E"');
  });

  it('[3TTK] must convert to SQLite including expansion with "ALL" and "NOT"', async function () {
    const clean = [[{ any: ['A', 'E'] }, { any: ['D'] }, { any: ['C'] }, { not: ['D', 'F'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '("A" OR "E") AND "D" AND "C" NOT "D" NOT "F"');
  });

  it('[1ZJU] must handle array of queries', async function () {
    const clean = [[{ any: ['B'] }], [{ any: ['D'] }, { not: ['E'] }]];
    const sqllite = toSQLiteQuery(clean);
    assert.deepEqual(sqllite, '("B") OR ("D" NOT "E")');
  });
});
