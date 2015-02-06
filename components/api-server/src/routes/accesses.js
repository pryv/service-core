var methodCallback = require('./methodCallback'),
    Paths = require('./Paths'),
    _ = require('lodash');

/**
 * Shared accesses route handling.
 *
 * @param {App} expressApp
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp, api) {

  expressApp.get(Paths.Accesses, function (req, res, next) {
    api.call('accesses.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Accesses, function (req, res, next) {
    api.call('accesses.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Accesses + '/:id', function (req, res, next) {
    var params = { id: req.param('id'), update: req.body };
    api.call('accesses.update', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.del(Paths.Accesses + '/:id', function (req, res, next) {
    var params = _.extend({id: req.param('id')}, req.query);
    api.call('accesses.delete', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Accesses + '/check-app', function (req, res, next) {
    api.call('accesses.checkApp', req.context, req.body, methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;
