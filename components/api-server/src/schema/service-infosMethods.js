const serviceInfos = require('./service-infos');
const helpers = require('./helpers');
const object = helpers.object;

module.exports = {
  get: {
    params: null,
    result: serviceInfos()
  }
};