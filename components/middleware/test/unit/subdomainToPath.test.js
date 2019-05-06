// @flow

const supertest = require('supertest');
const express = require('express');
const should = require('should');

const subdomainToPath = require('../../src/subdomainToPath')([]); 

/* globals describe, it */

describe('subdomainToPath middleware', function() {
  describe('using a minimal application', function () {
    const app = express(); 
    const request = supertest(app);
    
    app.use(subdomainToPath);
    app.get('*', (req: express$Request, res) => {
      res.json({path: req.path});
    });
    
    function ok(host: string, path: string): Promise<any> {
      return request
        .get('/path')
        .set('Host', host)
        .expect(200)
        .then((res) => {
          should(res.body.path).be.eql(path + '/path');
        });
    }
    
    it('[V0R9] should not transform illegal usernames', function () {
      return ok('user/name.pryv.li', '');
    });
    it('[Q5A5] should transform username into a path segment', function () {
      return ok('username.pryv.li', '/username');
    });
    it('[IDDE] should accept dashes', function () {
      return ok('a---0.pryv.li', '/a---0');
    });
  });
});