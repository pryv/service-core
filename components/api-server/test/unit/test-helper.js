/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
//  

const path = require('path');
const fs = require('fs');
const lodash = require('lodash');

const toplevel = require('test-helpers');

module.exports = lodash.merge({}, toplevel, {
  fixturePath: fixturePath, 
  fixtureFile: fixtureFile, 
}); 

function fixturePath(...parts) {
  return path
    .join(__dirname, '../fixtures', ...parts)
    .normalize(); 
}
function fixtureFile(...parts) {
  return fs.readFileSync(fixturePath(...parts));
}
