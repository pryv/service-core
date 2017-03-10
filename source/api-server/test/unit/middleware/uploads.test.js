
const express = require('express');
const bodyParser = require('body-parser');
const supertest = require('supertest');
const should = require('should');
const assert = require('assert');
const R = require('ramda');

const {fixturePath, fixtureFile} = require('../test-helper');
const uploads = require('../../../src/middleware/uploads'); 

/* globals describe, it */
describe('uploads middleware', function() {
  function app(): express$Application {
    const app = express(); 
    
    app.post('/path', bodyParser.json(), uploads.hasFileUpload, (req, res) => {
      res
        .status(200)
        .json({files: req.files});
    });
    
    return app;  
  }
  const request = supertest(app());
  
  describe('hasFileUpload', function () {
    it('should parse file uploads', function () {
      const rq = request
        .post('/path')
        .attach('file', fixturePath('somefile'), fixtureFile('somefile'));
        
      return rq
        .then((res) => {
          should(res.statusCode).be.eql(200); 
          
          const file = R.head(res.body.files); 
          should(file.originalname).be.eql('somefile');
        });
    });
  });
});
