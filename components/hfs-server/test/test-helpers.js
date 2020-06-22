/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Helper methods and setup for all unit tests. 

const path = require('path');

function fixturePath(...args): string {
  return path.join(__dirname, './fixtures', ...args).normalize(); 
}
  
async function loadSettings() {
  const Settings = require('../src/Settings');
  return await Settings.loadFromFile(fixturePath('config.json'));
}


module.exports = {
  loadSettings: loadSettings, 
};
