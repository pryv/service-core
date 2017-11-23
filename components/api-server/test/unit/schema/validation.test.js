// @flow

/* global describe, it */
require('../test-helper');
const assert = require('chai').assert;

const { tryCoerceStringValues } = require('../../../src/schema/validation');

describe('tryCoerceStringValues', () => {
  it('should behave as documented in the method', () => {
    const object = { a: 'true', 'b': '2343', c: 'foobar' };
    const types = { a: 'boolean', b: 'number' };
    tryCoerceStringValues(object, types);
    
    const expect = { a: true, 'b': 2343, c: 'foobar' };
    assert.deepEqual(object, expect);
  });
  
  it('should convert to array', () => {
    const obj = { a: '1', b: 'test' };
    
    tryCoerceStringValues(obj, { a: 'array', b: 'array' });
    
    assert.deepEqual(obj, {a: ['1'], b: ['test']});
  });
  it('number conversion works', () => {
    
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
  it('integer conversion works', () => {
    
    ok('123', 123); 
    ok('123.45', 123); 
    
    ok('123abc', 123);
    ok('123.45aksfhjal', 123);
    
    not_ok('a213b');
    
    function ok(n: string, e: number) {
      const o = { a: n };
      const s = { a: 'integer' };
      
      tryCoerceStringValues(o, s);
      
      assert.equal(o.a, e);
    }
    function not_ok(n: string) {
      const o = { a: n };
      const s = { a: 'integer' };
      
      tryCoerceStringValues(o, s);
      
      assert.equal(o.a, n);
    }
  });
});