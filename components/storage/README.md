# Pryv storage component

Handles storage of user data on MongoDB.


## Contribute

Make sure to check the root README first.

## DB migration

1. Checkout tag that doesn't have your update's changes.
2. Generate dump
  1. Go to [dist/components/test-helpers](../test-helpers) and run `npm run dump-test-data ${old-version}`, providing the latest released version. (testData.resetUsers might alter data with `buildCustomAccountProperties()`)
  2. Copy `dist/components/tests-helpers/src/data/dumps/${old-version}/` to `components/tests-helpers/src/data/dumps/${old-version}`
  3. If needed, add old indexes to [components/test-helpers/src/data/structure/${old-version}](../test-helpers/src/structure/).
  4. Stash your changes
  5. Checkout where you were on your feature branch
  6. unstash your dump
2. If migrating indexes, add current ones to [components/test-helpers/src/data/structure/${new-version}](../test-helpers/src/structure/).
3. Add your test to [test/Versions.test.js](test/Versions.test.js)
4. Implement your migration procedure in [src/migration/${new-version}](src/migration/)

### Tests

- `npm run test` (or `npm test`) for quiet output
- `npm run test-detailed` for detailed test specs and debug log output
- `npm run test-profile` for profiling the tested server instance and opening the processed output with `tick-processor`
- `npm run test-debug` is similar as `npm run test-detailed` but in debug mode; it will wait for a debugger to be attached on port 5858



# License
Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
Unauthorized copying of this file, via any medium is strictly prohibited
Proprietary and confidential