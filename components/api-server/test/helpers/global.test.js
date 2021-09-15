const integrityFinalCheck = require('test-helpers/src/integrity-final-check');

afterEach(async function () {
  await integrityFinalCheck.events();
});