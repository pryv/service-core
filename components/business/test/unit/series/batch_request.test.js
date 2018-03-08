
// @flow

/* global describe, it */

const chai = require('chai');
const assert = chai.assert;

const { BatchRequest, BatchRequestElement, ParseFailure } = require('../../../src/series/batch_request');

const { TypeRepository } = require('../../../src/types');
const InfluxRowType = require('../../../src/types/influx_row_type');

describe('BatchRequest', () => {
  describe('.parse', () => {
    const typeRepo = new TypeRepository(); 
    const type: InfluxRowType = (typeRepo.lookup('series:position/wgs84'): any);
    const resolver = () => Promise.resolve(type);

    it('should parse the happy case', async () => {
      const happy = {
        format: 'seriesBatch', 
        data: [
          {
            'eventId': 'cjcrx6jy1000w8xpvjv9utxjx',
            'data': {
              'format': 'flatJSON', 
              'fields': ['timestamp', 'latitude', 'longitude', 'altitude'], 
              'points': [
                [1519314345, 10.2, 11.2, 500], 
                [1519314346, 10.2, 11.2, 510],
                [1519314347, 10.2, 11.2, 520],
              ] // points
            } // flatJSON 
          } // event
        ] // seriesBatch
      };
      
      const request = await BatchRequest.parse(happy, resolver);
      assert.strictEqual(request.length(), 1); 
      
      const element = request.list[0];
      assert.strictEqual(element.eventId, 'cjcrx6jy1000w8xpvjv9utxjx');
    });
    it('accepts an empty batch', () => {
      good({
        format: 'seriesBatch', 
        data: [], 
      });
    });
  
    it('throws if format is missing or wrong', () => {
      bad({format: 'something else'});
      bad({});
    });
    it('throws if another type is passed in', () => {
      bad(null);
      bad('a string');
      bad(42);
    });
    it("throws if envelope doesn't have a data attribute", () => {
      bad({
        format: 'seriesBatch', 
        foo: 'bar',
      });
    });
    
    function bad(obj: mixed) {
      assert.throws(() => {
        BatchRequest.parse(obj, resolver);
      }, ParseFailure);
    }
    function good(obj: mixed) {
      assert.doesNotThrow(() => {
        BatchRequest.parse(obj, resolver);
      });
    }
  });
});

describe('BatchRequestElement', () => {
  describe('.parse(obj)', () => {
    const typeRepo = new TypeRepository(); 
    const type: InfluxRowType = (typeRepo.lookup('series:position/wgs84'): any);
    const resolver = () => Promise.resolve(type);
    
    // XXX A third object transforms 'eventId's into row types. It should cache
    // meta data by eventId.

    it('should parse a good looking object', () => {
      good({
        eventId: 'cjcrx6jy1000w8xpvjv9utxjx', 
        data: {
          'format': 'flatJSON', 
          'fields': ['timestamp', 'latitude', 'longitude', 'altitude'], 
          'points': [
            [1519314345, 10.2, 11.2, 500], 
            [1519314346, 10.2, 11.2, 510],
            [1519314347, 10.2, 11.2, 520],
          ]
        }
      });
    });
    
    it('fails if input is not an Object', () => {
      bad(null);
      bad('string');
    }); 
    it('fails if eventId is missing or the wrong type', () => {
      bad({ foo: 'bar' });
      bad({ eventId: 42 });
    });

    function bad(obj: mixed) {
      assert.throws(() => {
        BatchRequestElement.parse(obj, resolver);
      }, ParseFailure);
    }
    function good(obj: mixed) {
      assert.doesNotThrow(() => {
        BatchRequestElement.parse(obj, resolver);
      });
    }
  });
});