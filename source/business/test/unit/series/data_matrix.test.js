// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it */
const { should } = require('../../test-helpers');

const Row = require('../../../src/series/row');

describe('DataMatrix', function () {
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