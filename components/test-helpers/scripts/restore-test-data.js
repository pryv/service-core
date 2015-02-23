/**
 * Restores from a previously dumped version of test data.
 * See `../src/data` for details.
 */

if (! process.argv[2]) {
  console.log('Usage: ' + '`node restore-test-data {version}` (e.g. `0.2.0`)');
  process.exit(1);
}

var testData = require('../src/data'),
    mongoFolder = __dirname + '/../../../../mongodb-osx-x86_64-2.6.0';
testData.restoreFromDump(process.argv[2], mongoFolder, function (err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
});

