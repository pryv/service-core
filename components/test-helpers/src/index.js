/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
exports = module.exports = {
  request: require('./request'),
  InstanceManager: require('./InstanceManager'),
  instanceTestSetup: require('./instanceTestSetup'),
  spawner: require('./spawner'),
  child_process: require('./child_process'),
  syncPrimitives: require('./condition_variable'),
  databaseFixture: require('./database_fixture')
};
// ---------------------------------------------------------- deprecated helpers
// NOTE Below we define a few helpers as being lazily loaded attributes on the
//  exports object. This is because we don't want to load them each time we load
//  the test helpers. Eventually, we'll write tests in a different style and not
//  need these anymore.

Object.defineProperty(exports, 'attachmentsCheck', {
  get: function () {
    return require('./attachmentsCheck');
  }
});

Object.defineProperty(exports, 'data', {
  get: function () {
    return require('./data');
  }
});

Object.defineProperty(exports, 'dependencies', {
  get: function () {
    return require('./dependencies');
  }
});
