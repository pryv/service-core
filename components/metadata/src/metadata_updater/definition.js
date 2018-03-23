
// @flow

const rpc = require('components/tprpc');

module.exports = {
  produce: () => rpc.load(__dirname + '/interface.proto'),
};
