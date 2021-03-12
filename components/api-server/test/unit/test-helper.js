/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow 

const path = require('path');
const fs = require('fs');
const lodash = require('lodash');

const toplevel = require('test-helpers');

module.exports = lodash.merge({}, toplevel, {
  fixturePath: fixturePath, 
  fixtureFile: fixtureFile, 
}); 

function fixturePath(...parts: Array<string>): string {
  return path
    .join(__dirname, '../fixtures', ...parts)
    .normalize(); 
}
function fixtureFile(...parts: Array<string>): Buffer {
  return fs.readFileSync(fixturePath(...parts));
}
