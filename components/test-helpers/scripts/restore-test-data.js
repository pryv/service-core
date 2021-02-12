/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Restores from a previously dumped version of test data.
 * See `../src/data` for details.
 */

if (! process.argv[2]) {
  console.log('Usage: ' + '`node restore-test-data {version}` (e.g. `0.2.0`)');
  process.exit(1);
}

var testData = require('../src/data'),
    mongoFolder = __dirname + '/../../../../mongodb';
testData.restoreFromDump(process.argv[2], mongoFolder, function (err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
});

