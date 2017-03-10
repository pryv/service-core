exports = module.exports = {
  request: require('./request'),
  attachmentsCheck: require('./attachmentsCheck'),
  data: require('./data'),
  dependencies: require('./dependencies'),
  InstanceManager: require('./InstanceManager')
};

// if (process.env.NODE_ENV === 'test') {
  exports.instanceTestSetup = require('./instanceTestSetup');
// }
