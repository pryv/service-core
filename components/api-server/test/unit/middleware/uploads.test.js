/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict'; 
// @flow

const express = require('express');
const bodyParser = require('body-parser');
const supertest = require('supertest');
const should = require('should');

const {fixturePath, fixtureFile} = require('../test-helper');
const uploads = require('../../../src/middleware/uploads'); 

/* globals describe, it */
describe('uploads middleware', function() {
  function app(): express$Application {
    const app = express(); 
    
    const verifyAssumptions = (req: express$Request, res) => {
      res
        .status(200)
        .json({files: req.files});
    }; 
    
    app.post('/path', bodyParser.json(), uploads.hasFileUpload, verifyAssumptions);
    
    return app;  
  }
  const request = supertest(app());
  
  describe('hasFileUpload', function () {
    it('[GY5H] should parse file uploads', function () {
      const rq = request
        .post('/path')
        .attach('file', fixturePath('somefile'), fixtureFile('somefile'));
        
      return rq
        .then((res) => {
          should(res.statusCode).be.eql(200); 
          
          const files = res.body.files; 
          if (! Array.isArray(files)) throw new Error('AF: must be an array');
          
          const file = files[0];
          if (file == null || file.originalname == null) throw new Error('AF: should not be null');
          should(file.originalname).be.eql('somefile');
        });
    });
  });
});
