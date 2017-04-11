// @flow

// Unit test for type repository

/* global describe, it */

const should = require('should');
const memo = require('memo-is');

const {TypeRepository} = require('../../src/types');

describe('business.types.TypeRepository', function () {
  const repository = memo().is(() => new TypeRepository());
  
  describe('basic types like mass/kg', function () {
    it('should be known', function () {
      should(
        repository().isKnown('mass/kg')
      ).be.true(); 
    });
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
    it('should be known', function () {
      should(
        repository().isKnown('position/wgs84')
      ).be.true(); 
    });
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
    it('should be known', function () {
      should(
        repository().isKnown('series:position/wgs84')
      ).be.true(); 
      should(
        repository().isKnown('series:mass/kg')
      ).be.true(); 
    });
    it('should inform about fields correctly', function () {
      const eventType = repository().lookup('series:mass/kg');

      should(eventType.requiredFields()).be.eql(['timestamp', 'value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['timestamp', 'value']);
    });
  });
});

describe('business.types.TypeValidator', function () {
  const repository = memo().is(() => new TypeRepository());

  it('should be produced via a type repository', function () {
    const validator = repository().validator(); 
    
    should(validator.constructor.name).be.eql('TypeValidator');
  });
  it('should validate simple types', function () {
    const validator = repository().validator(); 
    const schema = { type: 'number' }; 
    
    return validator.validateWithSchema(1234, schema); 
  });
  it('should validate complex types', function () {
    const validator = repository().validator(); 
    const schema = { type: 'object', 
      properties: {
        a: { type: 'number' }, 
        b: { type: 'string' }, 
      }};  
      
    const value = {
      a: 1234, 
      b: 'string',
    };
    
    return validator.validateWithSchema(value, schema); 
  });
});