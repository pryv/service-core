'use strict';
// @flow

// Helper methods and setup for all unit tests. 
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });


const should = require('should');
const superagent = require('superagent');
const request = require('supertest');

module.exports = {
  should: should, 
  superagent: superagent, 
  request: request, 
};

