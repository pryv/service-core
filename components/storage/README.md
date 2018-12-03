# Pryv storage component

Handles storage of user data on MongoDB.


## Contribute

Make sure to check the root README first.

## DB migration

1. Go to [components/test-helpers](../test-helpers) and run `yarn dump-test-data {version}`, providing the latest released version.
2. If migrating indexes, add current ones to [components/test-helpers/src/data/structure/{version}](../test-helpers/src/data/structure).
3. Add your test to [test/Versions.test.js](test/Versions.test.js)
4. Implement your migration procedure in [src/migration/{newVersion}](src/migration/)

### Tests

- `npm run test` (or `npm test`) for quiet output
- `npm run test-detailed` for detailed test specs and debug log output
- `npm run test-profile` for profiling the tested server instance and opening the processed output with `tick-processor`
- `npm run test-debug` is similar as `npm run test-detailed` but in debug mode; it will wait for a debugger to be attached on port 5858
