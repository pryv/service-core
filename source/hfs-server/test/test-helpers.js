'use strict';
// @flow

// Helper methods and setup for all unit tests. 

const should = require('should');
const superagent = require('superagent');
const request = require('supertest');
const path = require('path');

function fixturePath(...args): string {
  return path.join(__dirname, './fixtures', ...args).normalize(); 
}
  
const Settings = require('../src/Settings');
const settings = Settings.loadFromFile(fixturePath('config.json'));

module.exports = {
  should: should, 
  superagent: superagent, 
  request: request, 
  settings: settings, 
};
