'use strict';
// @flow

/* global describe, it */
const { should, settings } = require('./test-helpers');

describe('Settings', function() {
  it('should have been loaded for test execution', function() {
    should.exist(settings);
  });
});
