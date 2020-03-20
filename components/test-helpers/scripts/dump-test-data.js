/**
 * Dumps test data into a `data` subfolder named after the provided version.
 * See `../src/data` for details.
 */

const testData = require('../src/data');
const mongoFolder = __dirname + '/../../../../../mongo-bin';

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

