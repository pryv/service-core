/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Sets every component's version as that of the root package.
 */

var childProcess = require('child_process'),
    rootVersion = require(require('path').resolve(__dirname, '../package.json')).version;

var res = childProcess.spawnSync('node', [
  __dirname + '/components-npm.js',
  'version',
  rootVersion
], {
  env: process.env,
  stdio: 'inherit'
});

process.exit(res.status);
