// @flow 

const path = require('path');
const fs = require('fs');

module.exports = {
  fixturePath: fixturePath, 
  fixtureFile: fixtureFile, 
};

function fixturePath(...parts: Array<string>): string {
  return path
    .join(__dirname, '../fixtures', ...parts)
    .normalize(); 
}
function fixtureFile(...parts: Array<string>): Buffer {
  return fs.readFileSync(fixturePath(...parts));
}
