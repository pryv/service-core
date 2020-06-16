// @flow

const should = require('should');

/* global describe, it */
const { loadSettings } = require('./test-helpers');

describe('Settings', () => {
  it('[KEEZ] should have been loaded for test execution', async () => {
    should.exist(await loadSettings());
  });
});
