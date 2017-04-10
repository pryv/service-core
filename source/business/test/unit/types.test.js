// @flow

// Unit test for type repository

/* global describe, it */

const should = require('should');
const memo = require('memo-is');

const {TypeRepository} = require('../../src/types');

describe('business.types.TypeRepository', function () {
  describe('basic types like mass/kg', function () {
    const repository = memo().is(() => new TypeRepository());
    
    it('should return a type instance allowing conversion', function () {
      const eventType = repository().lookup('mass/kg');
      
      should(eventType.requiredFields()).be.eql(['value']);
      should(eventType.optionalFields()).be.eql([]);
      
      const fieldType = eventType.forField('value'); 
      should(fieldType.coerce('1234')).be.eql(1234); 
      should(fieldType.coerce(1234)).be.eql(1234); 
    });
  });
});