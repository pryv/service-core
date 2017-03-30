// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should } = require('../../test-helpers');

const DataMatrix = require('../../../src/series/data_matrix');
const Row = require('../../../src/series/row');

describe('DataMatrix', function () {
  describe('eachRow', function () {
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
        if (idx == 0) should(row.values).be.eql([1,2,3]);
        if (idx == 1) should(row.values).be.eql([4,5,6]);
        
        should(row.columnNames).be.eql(headers);
        
        times += 1; 
      });
      
      should(times).be.eql(2);
    });
  });
  describe('transform', function () {
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
        should(name).be.eql(headers[n % 3]);
        should(value).be.eql(n+1);
        
        n += 1; 
      });
    });
    it('should store the return value in the matrix', function () {
      const headers = ['a', 'b', 'c']; 
      const matrix = new DataMatrix(
        headers,
        [
          [1,2,3], [4,5,6]
        ]
      ); 

      matrix.transform((name, value) => {
        return 42; // don't ask
      });
      
      should(matrix.at(0)).assert == [42, 42, 42];
    });
  });
});

describe('business.series.Row', function () {
  describe('toStruct', function () {
    it('should return a js object for the row', function () {
      const row = new Row([1, 2], ['a', 'b']);
      
      const obj = row.toStruct();
        
      should(obj.a).be.eql(1);
      should(obj.b).be.eql(2); 
      should(Object.keys(obj).length).be.eql(2);
    });
  });
});
