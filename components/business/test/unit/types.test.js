// @flow

// Unit test for type repository

/* global describe, it, beforeEach */

const should = require('should');
const chai = require('chai');

const { assert } = chai;

const { TypeRepository } = require('../../src/types');

describe('business.types.TypeRepository', () => {
  let repository;
  beforeEach(() => {
    repository = new TypeRepository();
  });

  describe('type list update', () => {
    const sourceURL = 'https://pryv.github.io/event-types/flat.json';

    it('[WMDW] should work (must be called manually)', () =>
    // NOTE This test uses an internet URL. If internet is down, it will
    // not work. Much like Pryv in general, also because of this function.

      repository.tryUpdate(sourceURL));
    it('[6VL6] should fail gracefully', () => repository.tryUpdate('bahbahblacksheep')
      .catch(
        (err) => should(err.message).match(/Could not update event types/),
      ));
  });
  describe('basic types like mass/kg', () => {
    it('[EEWV] should be known', () => {
      should(
        repository.isKnown('mass/kg'),
      ).be.true();
    });
    it('[J0CJ] should return a type instance allowing conversion', () => {
      const eventType = repository.lookup('mass/kg');

      should(eventType.requiredFields()).be.eql(['value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['value']);

      const fieldType = eventType.forField('value');
      should(fieldType.coerce('1234')).be.eql(1234);
      should(fieldType.coerce(1234)).be.eql(1234);
    });
    it('[8WI1] should throw when conversion fails', () => {
      const eventType = repository.lookup('mass/kg');
      const fieldType = eventType.forField('value');

      should.throws(() => fieldType.coerce({}), Error);
    });
    it('[WKCS] should coerce to number during validation', () => {
      const eventType = repository.lookup('mass/kg');
      const validator = repository.validator();

      return eventType.callValidator(validator, '123')
        .then((val) => should(val).be.eql(123));
    });
  });
  describe('complex types like position/wgs84', () => {
    it('[05LA] should be known', () => {
      should(
        repository.isKnown('position/wgs84'),
      ).be.true();
    });
    it('[0QZ3] should return a complex type instance', () => {
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

    it('[D0GT] should return the correct value type for all fields', () => {
      assert.strictEqual(
        type.forField('id').coerce('123'),
        '123',
      );
    });
    it('[3BC9] should return the correct value type for optional fields', () => {
      assert.strictEqual(
        type.forField('source').coerce('123'),
        '123',
      );
    });
    it('[IVPF] should resolve nested fields', () => {
      const inner = type.forField('from.name');
      assert.strictEqual(
        inner.coerce('123'),
        '123',
      );
    });
    it('[5PMM] does NOT handle requiredFields fully yet: only surface requirements are returned', () => {
      assert.deepEqual(type.requiredFields(), ['id', 'message']);
    });
  });
  describe('placeholder types like picture/attached', () => {
    it('[78HI] should be known', () => {
      assert.isTrue(
        repository.isKnown('picture/attached'),
      );
    });
    it('[85BQ] should return a type instance allowing conversion', () => {
      const eventType = repository.lookup('picture/attached');

      assert.deepEqual(eventType.requiredFields(), ['value']);
      assert.deepEqual(eventType.optionalFields(), []);
      assert.deepEqual(eventType.fields(), ['value']);

      // The type 'null' ignores content submitted to it and stores a 'null'
      // in the content field.
      const fieldType = eventType.forField('value');
      assert.deepEqual(
        fieldType.coerce('some value'), null,
      );
      assert.deepEqual(
        fieldType.coerce(132136), null,
      );
    });
  });
  describe('series types like series:mass/kg', () => {
    it('[SQNQ] should be known', () => {
      should(
        repository.isKnown('series:position/wgs84'),
      ).be.true();
      should(
        repository.isKnown('series:mass/kg'),
      ).be.true();
    });
    it('[IR3B] should inform about fields correctly', () => {
      const eventType = repository.lookup('series:mass/kg');

      should(eventType.requiredFields()).be.eql(['deltaTime', 'value']);
      should(eventType.optionalFields()).be.eql([]);
      should(eventType.fields()).be.eql(['deltaTime', 'value']);
    });
  });
});

describe('business.types.TypeValidator', () => {
  let repository;
  beforeEach(() => {
    repository = new TypeRepository();
  });

  it('[AE3Q] should be produced via a type repository', () => {
    const validator = repository.validator();

    should(validator.constructor.name).be.eql('TypeValidator');
  });
  it('[JT1F] should validate simple types', () => {
    const validator = repository.validator();
    const schema = { type: 'number' };

    return validator.validateWithSchema(1234, schema);
  });
  it('[QIVH] should validate complex types', () => {
    const validator = repository.validator();
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'string' },
      },
    };

    const value = {
      a: 1234,
      b: 'string',
    };

    return validator.validateWithSchema(value, schema);
  });
});
