var methodCallback = require('./methodCallback'),
    Paths = require('./Paths');

/**
 * User account details route handling.
 *
 * @param expressApp
 * @param api
 */
module.exports = function (expressApp, api) {

  expressApp.get(Paths.Account, function (req, res, next) {
    api.call('account.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Account, function (req, res, next) {
    api.call('account.update', req.context, {update: req.body}, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/change-password', function (req, res, next) {
    api.call('account.changePassword', req.context, req.body, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/request-password-reset', function (req, res, next) {
    var params = req.body;
    params.origin = req.headers.origin;
    api.call('account.requestPasswordReset', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/reset-password', function (req, res, next) {
    var params = req.body;
    params.origin = req.headers.origin;
    api.call('account.resetPassword', req.context, params, methodCallback(res, next, 200));
  });

};
module.exports.injectDependencies = true;
