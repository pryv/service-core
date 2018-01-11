'use strict';
// @flow

const should = require('should');

/* global describe, it */
const { settings } = require('./test-helpers');

describe('Settings', function() {
  it('should have been loaded for test execution', function() {
    should.exist(settings);
  });
});
