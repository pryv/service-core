// @flow

import type Application from '../application';

const middleware = require('components/middleware');
const methodCallback = require('./methodCallback');
const Paths = require('./Paths');

// User account details route handling.
module.exports = function (expressApp: express$Application, app: Application) {
  const { api } = app;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.Account,
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      api.call('account.get', req.context, req.query, methodCallback(res, next, 200));
    });

  expressApp.put(Paths.Account,
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      api.call('account.update', req.context, { update: req.body }, methodCallback(res, next, 200));
    });

  expressApp.post(`${Paths.Account}/change-password`,
    loadAccessMiddleware,
    (req: express$Request, res, next) => {
      api.call('account.changePassword', req.context, req.body, methodCallback(res, next, 200));
    });

  expressApp.post(`${Paths.Account}/request-password-reset`, (req: express$Request, res, next) => {
    const params = req.body;
    params.origin = req.headers.origin;
    api.call('account.requestPasswordReset', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(`${Paths.Account}/reset-password`, (req: express$Request, res, next) => {
    const params = req.body;
    params.origin = req.headers.origin;
    api.call('account.resetPassword', req.context, params, methodCallback(res, next, 200));
  });
};
