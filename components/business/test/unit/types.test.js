// @flow

// Unit test for type repository

/* global describe, it, beforeEach */

const should = require('should');
const chai = require('chai');
const assert = chai.assert;

const {TypeRepository} = require('../../src/types');

describe('business.types.TypeRepository', function () {
  let repository; 
  beforeEach(() => {
    repository = new TypeRepository(); 
  });
    
  describe('type list update', function () {
    const sourceURL = 'https://pryv.github.io/event-types/flat.json';
    
    it('should work (must be called manually)', function () {
      // NOTE This test uses an internet URL. If internet is down, it will 
      // not work. Much like Pryv in general, also because of this function. 
       
      return repository.tryUpdate(sourceURL);
    });
    it('should fail gracefully', function () {
      return repository.tryUpdate('bahbahblacksheep')
        .catch(
          (err) => should(err.message).match(/Could not update event types/));
    });
  });
  describe('basic types like mass/kg', function () {
    it('should be known', function () {
      should(
        repository.isKnown('mass/kg')
      ).be.true(); 
    });
    it('should return a type instance allowing conversion', function () {
      const eventType = repository.lookup('mass/kg');
      
      should(eventType.requiredFields()).be.eql(['value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['value']);
      
      const fieldType = eventType.forField('value'); 
      should(fieldType.coerce('1234')).be.eql(1234); 
      should(fieldType.coerce(1234)).be.eql(1234); 
    });
    it('should throw when conversion fails', function () {
      const eventType = repository.lookup('mass/kg');
      const fieldType = eventType.forField('value'); 

      should.throws(() => fieldType.coerce({}), Error); 
    });
    it('should coerce to number during validation', function () {
      const eventType = repository.lookup('mass/kg');
      const validator = repository.validator();
      
      return eventType.callValidator(validator, '123')
        .then((val) => should(val).be.eql(123));
    });
  });
  describe('complex types like position/wgs84', function () {
    it('should be known', function () {
      should(
        repository.isKnown('position/wgs84')
      ).be.true(); 
    });
    it('should return a complex type instance', function () {
      const eventType = repository.lookup('position/wgs84');

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
  describe('placeholder types like picture/attached', () => {
    it('should be known', function () {
      assert.isTrue(
        repository.isKnown('picture/attached'));
    });
    it('should return a type instance allowing conversion', function () {
      const eventType = repository.lookup('picture/attached');

      assert.deepEqual(eventType.requiredFields(), ['value']);
      assert.deepEqual(eventType.optionalFields(), []);
      assert.deepEqual(eventType.fields(), ['value']);

      // The type 'null' ignores content submitted to it and stores a 'null' 
      // in the content field. 
      const fieldType = eventType.forField('value'); 
      assert.deepEqual(
        fieldType.coerce('some value'), null);
      assert.deepEqual(
        fieldType.coerce(132136), null);
    });
  });
  describe('series types like series:mass/kg', function () {
    it('should be known', function () {
      should(
        repository.isKnown('series:position/wgs84')
      ).be.true(); 
      should(
        repository.isKnown('series:mass/kg')
      ).be.true(); 
    });
    it('should inform about fields correctly', function () {
      const eventType = repository.lookup('series:mass/kg');

      should(eventType.requiredFields()).be.eql(['timestamp', 'value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['timestamp', 'value']);
    });
  });
});

describe('business.types.TypeValidator', function () {
  let repository; 
  beforeEach(() => {
    repository = new TypeRepository(); 
  });

  it('should be produced via a type repository', function () {
    const validator = repository.validator(); 
    
    should(validator.constructor.name).be.eql('TypeValidator');
  });
  it('should validate simple types', function () {
    const validator = repository.validator(); 
    const schema = { type: 'number' }; 
    
    return validator.validateWithSchema(1234, schema); 
  });
  it('should validate complex types', function () {
    const validator = repository.validator(); 
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