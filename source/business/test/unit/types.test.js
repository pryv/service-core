// @flow

// Unit test for type repository

/* global describe, it */

const should = require('should');
const memo = require('memo-is');

const {TypeRepository} = require('../../src/types');

describe('business.types.TypeRepository', function () {
  const repository = memo().is(() => new TypeRepository());
  
  describe('basic types like mass/kg', function () {
    it('should return a type instance allowing conversion', function () {
      const eventType = repository().lookup('mass/kg');
      
      should(eventType.requiredFields()).be.eql(['value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['value']);
      
      const fieldType = eventType.forField('value'); 
      should(fieldType.coerce('1234')).be.eql(1234); 
      should(fieldType.coerce(1234)).be.eql(1234); 
    });
  });
  describe('complex types like position/wgs84', function () {
    it('should return a complex type instance', function () {
      const eventType = repository().lookup('position/wgs84');

      should(eventType.requiredFields()).be.eql([
        'latitude',
        'longitude',
      ]);
      should(eventType.optionalFields()).be.eql([
        'altitude', 'horizontalAccuracy', 'verticalAccuracy', 
        'speed', 'bearing',
      ]);
      should(eventType.fields()).be.eql([
        'latitude', 'longitude',
        'altitude', 'horizontalAccuracy', 'verticalAccuracy', 
        'speed', 'bearing',
      ]);
      
    });
  });
  describe('series types like series:mass/kg', function () {
    it('should inform about fields correctly', function () {
      const eventType = repository().lookup('series:mass/kg');

      should(eventType.requiredFields()).be.eql(['timestamp', 'value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['timestamp', 'value']);
    });
  });
});