'use strict';
// @flow

/* global describe, it, beforeEach, afterEach */
const should = require('should');
const superagent = require('superagent');
const url = require('url');

const Settings = require('../../src/Settings');
const Server = require('../../src/Server');

describe('Server', function() {
  const settings = new Settings(); 
  const request = superagent;

  var server = new Server(settings); 
  
  function toUrl(path): string {
    const baseUrl = server.baseUrl; 
      
    return url.resolve(baseUrl, path);
  }

  it('can be constructed', function() {
    should.exist(server);
  });
  
  describe('.start', function() {    
    beforeEach(function() {
      server.start(); 
    });
    afterEach(function() {
      server.stop(); 
    });
    
    it('starts a http server on configured port', function() {
      // Now we should have a local server running. 
      const statusUrl = toUrl('/system/status');
      var response = request.get(statusUrl);

      return response.then((res) => {
        should.equal(res.status, 200);
      });
    });
  });
}); 

