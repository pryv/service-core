
const requestModule = require('./request'); 

exports = module.exports = {
  request: requestModule,
  unpatchedRequest: requestModule.unpatched, 
  attachmentsCheck: require('./attachmentsCheck'),
  data: require('./data'),
  dependencies: require('./dependencies'),
  InstanceManager: require('./InstanceManager'),
  instanceTestSetup: require('./instanceTestSetup'), 
  spawner: require('./spawner'),
  syncPrimitives: require('./condition_variable'),
  databaseFixture: require('./database_fixture'),
};
