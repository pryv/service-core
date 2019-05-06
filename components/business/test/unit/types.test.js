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
    
    it('SRBJ-should work (must be called manually)', function () {
      // NOTE This test uses an internet URL. If internet is down, it will 
      // not work. Much like Pryv in general, also because of this function. 
       
      return repository.tryUpdate(sourceURL);
    });
    it('2Q0K-should fail gracefully', function () {
      return repository.tryUpdate('bahbahblacksheep')
        .catch(
          (err) => should(err.message).match(/Could not update event types/));
    });
  });
  describe('basic types like mass/kg', function () {
    it('P969-should be known', function () {
      should(
        repository.isKnown('mass/kg')
      ).be.true(); 
    });
    it('TN5N-should return a type instance allowing conversion', function () {
      const eventType = repository.lookup('mass/kg');
      
      should(eventType.requiredFields()).be.eql(['value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['value']);
      
      const fieldType = eventType.forField('value'); 
      should(fieldType.coerce('1234')).be.eql(1234); 
      should(fieldType.coerce(1234)).be.eql(1234); 
    });
    it('KQSG-should throw when conversion fails', function () {
      const eventType = repository.lookup('mass/kg');
      const fieldType = eventType.forField('value'); 

      should.throws(() => fieldType.coerce({}), Error); 
    });
    it('MM0V-should coerce to number during validation', function () {
      const eventType = repository.lookup('mass/kg');
      const validator = repository.validator();
      
      return eventType.callValidator(validator, '123')
        .then((val) => should(val).be.eql(123));
    });
  });
  describe('complex types like position/wgs84', function () {
    it('LMVV-should be known', function () {
      should(
        repository.isKnown('position/wgs84')
      ).be.true(); 
    });
    it('1NQ3-should return a complex type instance', function () {
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
  describe('complex types on several levels like message/facebook', () => {
    let type; 
    beforeEach(() => {
      type = repository.lookup('message/facebook');
    });
    
    it('83GI-should return the correct value type for all fields', () => {
      assert.strictEqual(
        type.forField('id').coerce('123'), 
        '123');
    });
    it('5AZB-should return the correct value type for optional fields', () => {
      assert.strictEqual(
        type.forField('source').coerce('123'), 
        '123');
    });
    it('G4R2-should resolve nested fields', () => {
      const inner = type.forField('from.name'); 
      assert.strictEqual(
        inner.coerce('123'), 
        '123');
    });
    it('K9HA-does NOT handle requiredFields fully yet: only surface requirements are returned', () => {
      assert.deepEqual(type.requiredFields(), ['id', 'message']);
    });
  });
  describe('placeholder types like picture/attached', () => {
    it('41MH-should be known', function () {
      assert.isTrue(
        repository.isKnown('picture/attached'));
    });
    it('HFMV-should return a type instance allowing conversion', function () {
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
    it('4HM0-should be known', function () {
      should(
        repository.isKnown('series:position/wgs84')
      ).be.true(); 
      should(
        repository.isKnown('series:mass/kg')
      ).be.true(); 
    });
    it('C4VK-should inform about fields correctly', function () {
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

  it('4I3A-should be produced via a type repository', function () {
    const validator = repository.validator(); 
    
    should(validator.constructor.name).be.eql('TypeValidator');
  });
  it('LBOU-should validate simple types', function () {
    const validator = repository.validator(); 
    const schema = { type: 'number' }; 
    
    return validator.validateWithSchema(1234, schema); 
  });
  it('6IQQ-should validate complex types', function () {
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