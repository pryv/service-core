'use strict';
// @flow

const should = require('should');
const superagent = require('superagent');
const url = require('url');
/* global describe, it, beforeEach, afterEach */

const { settings } = require('./test-helpers');

const Application = require('../../src/Application');

describe('Server', function() {
  const request = superagent;

  const application = new Application().init(settings); 
  const server = application.server; 
  
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

