/**
 * Restores from a previously dumped version of test data.
 * See `../src/data` for details.
 */

if (!process.argv[2]) {
  console.log('Usage: ' + '`node restore-test-data {version}` (e.g. `0.2.0`)');
  process.exit(1);
}

const testData = require('../src/data');

const mongoFolder = `${__dirname}/../../../../mongodb`;

testData.restoreFromDump(process.argv[2], mongoFolder, (err) => {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
});
