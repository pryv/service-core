/**
 * Dumps test data (current version) into a `data` subfolder named after the package version.
 * See `../src/data` for details.
 */

var testData = require('../src/data'),
    mongoFolder = __dirname + '/../../../../mongodb-osx-x86_64-2.6.0';
testData.dumpCurrent(mongoFolder, function (err) {
  if (err) {
    console.error(err);
  }
  process.exit(err ? 1 : 0);
});

