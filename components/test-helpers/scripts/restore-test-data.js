/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');

/**
 * Restores from a previously dumped version of test data.
 * See `../src/data` for details.
 */

if (!process.argv[2]) {
  console.log('Usage: ' + '`node restore-test-data {version}` (e.g. `0.2.0`)');
  process.exit(1);
}

const testData = require('../src/data');
const mongoFolder = path.resolve(__dirname, '../../../../mongodb');
testData.restoreFromDump(process.argv[2], mongoFolder, function (err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
});
