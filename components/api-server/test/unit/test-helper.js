/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const fs = require('fs');
const lodash = require('lodash');
const toplevel = require('test-helpers');
module.exports = lodash.merge({}, toplevel, {
  fixturePath,
  fixtureFile
});
/**
 * @param {Array<string>} parts
 * @returns {string}
 */
function fixturePath (...parts) {
  return path.join(__dirname, '../fixtures', ...parts).normalize();
}
/**
 * @param {Array<string>} parts
 * @returns {Buffer}
 */
function fixtureFile (...parts) {
  return fs.readFileSync(fixturePath(...parts));
}
