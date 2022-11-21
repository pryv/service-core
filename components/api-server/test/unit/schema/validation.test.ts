/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* global describe, it */
require('../test-helper');
const assert = require('chai').assert;

const { tryCoerceStringValues } = require('../../../src/schema/validation');

describe('tryCoerceStringValues', () => {
  it('[DTZ1] should behave as documented in the method', () => {
    const object = { a: 'true', b: '2343', c: 'foobar' };
    const types = { a: 'boolean', b: 'number' };
    tryCoerceStringValues(object, types);

    const expect = { a: true, b: 2343, c: 'foobar' };
    assert.deepEqual(object, expect);
  });

  it("[X26S] doesn't create keys in object", () => {
    const o = {};
    const t = { a: 'number' };

    tryCoerceStringValues(o, t);

    assert.lengthOf(Object.keys(o), 0, 'Keys have been created in target.');
  });
  it('[4MHH] should convert to array', () => {
    const obj = { a: '1', b: 'test' };

    tryCoerceStringValues(obj, { a: 'array', b: 'array' });

    assert.deepEqual(obj, { a: ['1'], b: ['test'] });
  });
  it('[X8PY] number conversion works', () => {
    ok('123', 123);
    ok('123.45', 123.45);

    not_ok('123abc');
    not_ok('123.45aksfhjal');

    function ok(n: string, e: number) {
      const o = { a: n };
      const s = { a: 'number' };

      tryCoerceStringValues(o, s);

      assert.equal(o.a, e);
    }
    function not_ok(n: string) {
      const o = { a: n };
      const s = { a: 'number' };

      tryCoerceStringValues(o, s);

      assert.equal(o.a, n);
    }
  });
});
