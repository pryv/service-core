'use strict';
// @flow

/* global describe, it */
const should = require('should');

const Server = require('../../src/server');

describe('Server', function() {
  it('can be constructed', function() {
    var server = new Server(); 
    should.exist(server);
  });
}); 

