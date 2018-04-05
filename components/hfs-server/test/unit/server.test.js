// @flow

/* global describe, it, beforeEach, afterEach, before */

const should = require('should');
const superagent = require('superagent');
const url = require('url');

const { settings } = require('./test-helpers');

const Application = require('../../src/application');

describe('Server', () => {
  const request = superagent;

  let application, server;
  before(async () => {
    application = new Application();
    await application.init(settings); 
    server = application.server; 
  }); 
  
  
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

