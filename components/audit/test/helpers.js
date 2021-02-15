/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Loaded by .mocharc.js for node tests
 */
const path = require('path');
const {getConfig} = require('@pryv/boiler').init(
  {appName: 'AuditTests', baseConfigDir: path.resolve(__dirname, '../config')});

const audit = require('../src/');

/**
 * To be call in before()
 */
async function initTests() {
  await audit.init();
  global.audit = audit;
  global.config = await getConfig();
}

/**
 * To be call in after()
 */
function closeTests() { 
  if (global.audit) global.audit.close();
  global.audit = null;
  global.config = null;
}

Object.assign(global, {
  initTests: initTests,
  closeTests: closeTests,
  assert: require('chai').assert,
  cuid: require('cuid'),
});


