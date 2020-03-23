'use strict';
// @flow

const should = require('should');

/* global describe, it */
const { loadSettings } = require('./test-helpers');

describe('Settings', function() {
  it('[KEEZ] should have been loaded for test execution', async function() {
    should.exist(await loadSettings());
  });
});
