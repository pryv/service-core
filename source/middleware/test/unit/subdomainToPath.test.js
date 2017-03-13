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
    app.get('*', (req, res) => {
      res.json({path: req.path});
    });
    
    it('should not transform illegal usernames', function () {
      return request
        .get('/path')
        .set('Host', 'username/foo.pryv.li')
        .expect(200)
        .then((res) => {
          should(res.body.path).be.eql('/path');
        });
    });
    it('should transform username into a path segment', function () {
      return request
        .get('/path')
        .set('Host', 'username.pryv.li')
        .expect(200)
        .then((res) => {
          should(res.body.path).be.eql('/username/path');
        });
    });
  });
});