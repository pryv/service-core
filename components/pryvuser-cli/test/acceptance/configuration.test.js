// @flow

const path = require('path');
const Configuration = require('../../src/configuration');

/* global describe, it, beforeEach */

const { fixturePath } = require('./test-helpers');
const chai = require('chai');
const assert = chai.assert;

describe('Configuration', () => {
  describe('.load(basePath)', () => {
    describe('when started in fixture 1', () => {
      it('finds all configuration files', async () => {
        const fixture = fixturePath('fileLocations1');
        const config = await Configuration.load(fixture);

        assert.strictEqual(config.coreConfigPath(), 
          path.join(fixture, 'conf/core/conf/core.json'));
        assert.strictEqual(config.hfsConfigPath(), 
          path.join(fixture, 'conf/hfs/conf/hfs.json'));
      });
    });
  });

  describe('with fileLocations1 fixture config', () => {
    let config; 
    beforeEach(async () => {
      config = await Configuration.load(fixturePath('fileLocations1'));
    });

    it('has the right register url and key', async () => {  
      const reg = config.registerSettings(); 

      assert.strictEqual(reg.url, 'https://reg.preview.pryv.tech');
      assert.strictEqual(reg.key, 'OVERRIDE ME');
    });
    it('has mongodb configured correctly (including defaults)', () => {
      const mongodb = config.mongoDbSettings(); 

      assert.strictEqual(mongodb.host, 'mongodb');
      assert.strictEqual(mongodb.port, 27017); // from defaults
    });
    it('has the right influxdb settings', async () => {
      const influxdb = config.influxDbSettings(); 
       
      assert.strictEqual(influxdb.host, 'influxdb');
      assert.strictEqual(influxdb.port, 8086);
    });
  });
});