// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');

import type Application from '../application';

// User account details route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;

  expressApp.get(Paths.Account, function (req: express$Request, res, next) {
    api.call('account.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Account, function (req: express$Request, res, next) {
    api.call('account.update', req.context, {update: req.body}, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/change-password', function (req: express$Request, res, next) {
    api.call('account.changePassword', req.context, req.body, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/request-password-reset', function (req: express$Request, res, next) {
    var params = req.body;
    params.origin = req.headers.origin;
    api.call('account.requestPasswordReset', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/reset-password', function (req: express$Request, res, next) {
    var params = req.body;
    params.origin = req.headers.origin;
    api.call('account.resetPassword', req.context, params, methodCallback(res, next, 200));
  });

};
