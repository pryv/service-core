var methodCallback = require('./methodCallback'),
    Paths = require('./Paths'),
    _ = require('lodash');

/**
 * Service info route handling.
 *
 * @param expressApp
 * @param api
 */
module.exports = function (expressApp, api) {

  expressApp.get(Paths.Service + '/info', function (req, res, next) {
    var params = _.extend({}, req.query);
    api.call('service.info', req.context, params, methodCallback(res, next, 200));
  });
};
module.exports.injectDependencies = true;
