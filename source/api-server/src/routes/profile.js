var methodCallback = require('./methodCallback'),
    Paths = require('./Paths'),
    _ = require('lodash');

/**
 * Profile route handling.
 *
 * @param expressApp
 * @param api
 */
module.exports = function (expressApp, api) {

  expressApp.get(Paths.Profile + '/public', function (req, res, next) {
    api.call('profile.getPublic', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Profile + '/public', update('public'));

  expressApp.get(Paths.Profile + '/app', function (req, res, next) {
    api.call('profile.getApp', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Profile + '/app', function (req, res, next) {
    var params = {update: req.body};
    api.call('profile.updateApp', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.Profile + '/private', get('private'));
  expressApp.put(Paths.Profile + '/private', update('private'));

  function get(id) {
    return function (req, res, next) {
      api.call('profile.get', req.context, _.extend(req.query, {id: id}),
          methodCallback(res, next, 200));
    };
  }

  function update(id) {
    return function (req, res, next) {
      api.call('profile.update', req.context, { id: id, update: req.body },
          methodCallback(res, next, 200));
    };
  }

};
module.exports.injectDependencies = true;
