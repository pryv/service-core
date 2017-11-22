'use strict';
// @flow

// Helper methods and setup for all unit tests. 

const path = require('path');

function fixturePath(...args): string {
  return path.join(__dirname, './fixtures', ...args).normalize(); 
}
  
const Settings = require('../src/Settings');
const settings = Settings.loadFromFile(fixturePath('config.json'));

module.exports = {
  settings: settings, 
};
