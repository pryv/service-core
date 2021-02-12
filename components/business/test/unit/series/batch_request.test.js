/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

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

    it('[QJ6L] should parse the happy case', async () => {
      const happy = {
        format: 'seriesBatch', 
        data: [
          {
            'eventId': 'cjcrx6jy1000w8xpvjv9utxjx',
            'data': {
              'format': 'flatJSON', 
              'fields': ['deltaTime', 'latitude', 'longitude', 'altitude'], 
              'points': [
                [0, 10.2, 11.2, 500], 
                [1, 10.2, 11.2, 510],
                [2, 10.2, 11.2, 520],
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
    it('[VV2O] accepts an empty batch', async () => {
      await good({
        format: 'seriesBatch', 
        data: [], 
      });
    });
  
    it('[0NWO] throws if format is missing or wrong', async () => {
      const errorMessage = 'Envelope "format" must be "seriesBatch"';
      await bad({format: 'something else'}, errorMessage);
      await bad({}, errorMessage);
    });
    it('[881Y] throws if another type is passed in', async () => {
      const errorMessage = 'Request body needs to be in JSON format.';
      await bad(null, errorMessage);
      await bad('a string', errorMessage);
      await bad(42, errorMessage);
    });
    it('[2PZ0] throws if envelope doesn\'t have a data attribute', async () => {
      const errorMessage = 'Envelope must have a data list, containing individual batch elements';
      await bad({
        format: 'seriesBatch', 
        foo: 'bar',
      }, errorMessage);
    });
    
    async function bad(obj: mixed, errorMessage: string) {
      try {
        await BatchRequest.parse(obj, resolver);
      } catch (err) {
        assert.isNotNull(err);
        assert.strictEqual(err.message, errorMessage);
      }
    }

    async function good(obj: mixed) {
      try {
        await BatchRequest.parse(obj, resolver);
      } catch (err) {
        assert.isNull(err);
      }
    }
  });
});

describe('BatchRequestElement', () => {
  describe('.parse(obj)', () => {
    const typeRepo = new TypeRepository(); 
    const type: InfluxRowType = (typeRepo.lookup('series:position/wgs84'): any);
    const resolver = () => Promise.resolve(type);
    
    it('[AGQK] should parse a good looking object', async () => {
      await good({
        eventId: 'cjcrx6jy1000w8xpvjv9utxjx', 
        data: {
          'format': 'flatJSON', 
          'fields': ['deltaTime', 'latitude', 'longitude', 'altitude'], 
          'points': [
            [0, 10.2, 11.2, 500], 
            [1, 10.2, 11.2, 510],
            [2, 10.2, 11.2, 520],
          ]
        }
      });
    });
    
    it('[LWME] fails if input is not an Object', async () => {
      const errorMessage = 'Batch element must be an object with properties.';
      await bad(null, errorMessage);
      await bad('string', errorMessage);
    }); 
    it('[BU7Q] fails if eventId is missing or the wrong type', async () => {
      const errorMessage = 'Batch element must contain an eventId of the series event.';
      await bad({ foo: 'bar' }, errorMessage);
      await bad({ eventId: 42 }, errorMessage);
    });

    async function bad(obj: mixed, errorMessage: string) {
      try {
        await BatchRequestElement.parse(obj, resolver);
      } catch (err) {
        assert.isNotNull(err);
        assert.strictEqual(err.message, errorMessage);
      }
    }

    async function good(obj: mixed) {
      try {
        await BatchRequestElement.parse(obj, resolver);
      } catch (err) {
        assert.isNull(err);
      }
    }
  });
});