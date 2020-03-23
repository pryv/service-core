// @flow

/* global describe, it, beforeEach, afterEach, before */

const should = require('should');
const superagent = require('superagent');
const url = require('url');

const { loadSettings } = require('./test-helpers');

const Application = require('../../src/application');

describe('Server', () => {
  const request = superagent;

  let application, server;
  before(async () => {
    application = new Application();
    await application.init(await loadSettings()); 
    server = application.server; 
  }); 
  
  
  function toUrl(path): string {
    const baseUrl = server.baseUrl; 
      
    return url.resolve(baseUrl, path);
  }

  it('[O84I] can be constructed', function() {
    should.exist(server);
  });
  
  describe('.start', function() {    
    beforeEach(async function() {
      await server.start(); 
    });
    afterEach(function() {
      server.stop(); 
    });
    
    it('[1VEL] starts a http server on configured port', function() {
      // Now we should have a local server running. 
      const statusUrl = toUrl('/system/status');
      var response = request.get(statusUrl);

      return response.then((res) => {
        should.equal(res.status, 200);
      });
    });
  });
}); 

