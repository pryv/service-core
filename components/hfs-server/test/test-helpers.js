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
  loadSettings,
};
