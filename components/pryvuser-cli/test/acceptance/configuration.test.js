// @flow

const Configuration = require('../../src/configuration');

/* global describe, it */

const { fixturePath } = require('./test-helpers');
const chai = require('chai');
const assert = chai.assert;

describe('Configuration', () => {
  describe('.load(basePath)', () => {
    describe('when started in fixture 1', () => {
      it('finds all configuration files', async () => {
        const config = await Configuration.load(fixturePath('fileLocations1'));

        assert.strictEqual(config.coreConfigPath(), 'conf/core/conf/core.json');
        assert.strictEqual(config.hfsConfigPath(), 'conf/hfs/conf/hfs.json');
      });
    });
  });
});