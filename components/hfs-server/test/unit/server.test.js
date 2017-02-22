'use strict';
// @flow

/* global describe, it */
const should = require('should');

const Settings = require('../../src/Settings');
const Server = require('../../src/Server');

describe('Server', function() {
  it('can be constructed', function() {
    const settings = new Settings(); 
    var server = new Server(settings); 
    
    should.exist(server);
  });
}); 

