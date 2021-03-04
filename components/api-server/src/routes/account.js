/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const _ = require('lodash');

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const middleware = require('middleware');
const { setMethodId } = require('middleware');

import type Application  from '../application';

// User account details route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.Account,
    setMethodId('account.get'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = req.query;
      api.call(req.context, methodCallback(res, next, 200));
    });

  expressApp.put(Paths.Account,
    setMethodId('account.update'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = {update: req.body};
      api.call(req.context, methodCallback(res, next, 200));
    });

  expressApp.post(Paths.Account + '/change-password',
    setMethodId('account.changePassword'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      req.context.params = req.body;
      api.call(req.context, methodCallback(res, next, 200));
    });

  expressApp.post(Paths.Account + '/request-password-reset',
    setMethodId('account.requestPasswordReset'),
    function (req: express$Request, res, next) {
      req.context.params = _.merge(req.body, { origin: req.headers.origin });
      api.call(req.context, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Account + '/reset-password',
    setMethodId('account.resetPassword'),
    function (req: express$Request, res, next) {
      req.context.params = _.merge(req.body, { origin: req.headers.origin });
      api.call(req.context, methodCallback(res, next, 200));
  });

};
