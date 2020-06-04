// @flow
const requestModule = require('./request'); 

exports = module.exports = {
  request: requestModule,
  // FLOW This style of exports doesn't work in @flow. Deprecated. 
  unpatchedRequest: requestModule.unpatched, 
  InstanceManager: require('./InstanceManager'),
  instanceTestSetup: require('./instanceTestSetup'), 
  spawner: require('./spawner'),
  child_process: require('./child_process'),
  syncPrimitives: require('./condition_variable'),
  databaseFixture: require('./database_fixture'),
};

// ---------------------------------------------------------- deprecated helpers

// NOTE Below we define a few helpers as being lazily loaded attributes on the 
//  exports object. This is because we don't want to load them each time we load
//  the test helpers. Eventually, we'll write tests in a different style and not
//  need these anymore. 

// FLOW
Object.defineProperty(exports, 'attachmentsCheck', {
  get: function () {
    return require('./attachmentsCheck'); } });

// FLOW
Object.defineProperty(exports, 'data', {
  get: function () {
    return require('./data'); } });

// FLOW
Object.defineProperty(exports, 'dependencies', {
  get: function () {
    return require('./dependencies'); } });
