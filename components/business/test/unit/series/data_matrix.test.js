// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const chai = require('chai');
const assert = chai.assert;

const DataMatrix = require('../../../src/series/data_matrix');
const { ParseFailure } = require('../../../src/series/errors');
const Row = require('../../../src/series/row');

const { TypeRepository } = require('../../../src/types');
const InfluxRowType = require('../../../src/types/influx_row_type');

describe('DataMatrix', function () {
  describe('.parse(obj)', () => {
    const typeRepo = new TypeRepository(); 
    const type: InfluxRowType = (typeRepo.lookup('series:position/wgs84'): any);
    
    it('should accept the happy path', () => {
      good({
        'format': 'flatJSON', 
        'fields': ['timestamp', 'latitude', 'longitude', 'altitude'], 
        'points': [
          [1519314345, 10.2, 11.2, 500]
        ]
      });
    });
    
    it('refuses if not an object', () => {
      bad(null);
      bad('a string');
    });
    it('refuses if format is not flatJSON', () => {
      bad({
        format: 'somethingElse'
      });
    });
    it('refuses if fields are not strings', () => {
      bad({
        format: 'flatJSON', 
        fields: null
      });
      bad({
        format: 'flatJSON', 
        fields: 42
      });
      bad({
        format: 'flatJSON', 
        fields: [ 13, 14 ]
      });
    });
    it('refuses if points is not an array', () => {
      bad({
        format: 'flatJSON', 
        fields: [ 'ts', 'foo' ], 
        points: 42
      });
    });
    it('refuses if field names are not correct', () => {
      bad({
        format: 'flatJSON', 
        fields: [ 'ts', 'foo' ], 
        points: []
      });
    });
    it('refuses if data cannot be coerced', () => {
      bad({
        format: 'flatJSON', 
        fields: [ 'timestamp', 'latitude' ], 
        points: [
          [1519314345, null],
        ]
      });
    });

    function good(obj: mixed) {
      assert.doesNotThrow(() => {
        DataMatrix.parse(obj, type);
      });
    }
    function bad(obj: mixed) {
      assert.throws(() => {
        DataMatrix.parse(obj, type);
      }, ParseFailure);
    }
  });

  describe('#eachRow', function () {
    it('should iterate over all matrix rows', function () {
      const headers = ['a', 'b', 'c']; 
      const matrix = new DataMatrix(
        headers,
        [
          [1,2,3], [4,5,6]
        ]
      ); 
      
      let times = 0; 
      matrix.eachRow((row, idx) => {
        if (idx == 0) assert.deepEqual(row.values, [1,2,3]);
        if (idx == 1) assert.deepEqual(row.values, [4,5,6]);

        assert.strictEqual(row.columnNames, headers);
        
        times += 1; 
      });

      assert.strictEqual(times, 2);
    });
  });
  describe('#transform', function () {
    it('should call fn for each cell', function () {
      const headers = ['a', 'b', 'c']; 
      const matrix = new DataMatrix(
        headers,
        [
          [1,2,3], [4,5,6]
        ]
      ); 
      
      let n = 0; 
      matrix.transform((name, value) => {
        assert.strictEqual(name, headers[n % 3]);
        assert.strictEqual(value, n+1);
        
        n += 1; 

        return value; // satisfy the checker
      });
      
      assert.strictEqual(n, 6);
    });
    it('should store the return value in the matrix', function () {
      const headers = ['a', 'b', 'c']; 
      const matrix = new DataMatrix(
        headers,
        [
          [1,2,3], [4,5,6]
        ]
      ); 

      matrix.transform(() => {
        return 42; // don't ask
      });
      
      assert.deepEqual(matrix.at(0), [42, 42, 42]);
    });
  });
  describe('#minmax()', () => {
    it('returns the minimum and maximum timestamp used', () => {
      const headers = ['a', 'b', 'timestamp']; 
      const matrix = new DataMatrix(
        headers,
        [
          [1,2,3], [4,5,6]
        ]
      );
      
      const [min, max] = matrix.minmax();
      assert.strictEqual(min, 3);
      assert.strictEqual(max, 6);
    });
    it('throws an error if the timestamp is missing', () => {
      const headers = ['a', 'b', 'c']; 
      const matrix = new DataMatrix(
        headers,
        [
          [1,2,3], [4,5,6]
        ]
      );
      
      assert.throws(
        () => matrix.minmax()
      );
    });
  });
});

describe('business.series.Row', function () {
  describe('toStruct', function () {
    it('should return a js object for the row', function () {
      const row = new Row([1, 2], ['a', 'b']);
      
      const obj = row.toStruct();
        
      // FLOW 
      assert.strictEqual(obj.a, 1);
      // FLOW
      assert.strictEqual(obj.b, 2); 
      assert.strictEqual(Object.keys(obj).length, 2);
    });
  });
});
