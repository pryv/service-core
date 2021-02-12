/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Dumps test data into a `data` subfolder named after the provided version.
 * See `../src/data` for details.
 */

const testData = require('../src/data');
// don't add additional layer of ".." as this script is meant to be launched with babel-node as per the package.json script
// it does require the "ln -s ../components components" symlink in the root node_modules/ of the projet
const mongoFolder = __dirname + '/../../../../var-pryv/mongodb-bin';

const version = process.argv[2];
if (version == null) {
  console.error('Please provide version as first argument');
  process.exit(1);
}

testData.dumpCurrent(mongoFolder, version, function (err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
});

