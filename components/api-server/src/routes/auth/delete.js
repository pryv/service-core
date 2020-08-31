/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('../methodCallback');
const API = require('../../API');
import type Application from '../../application';

/**
 * Routes for users
 * @param app
 */
module.exports = function(expressApp: express$Application, app: Application) {
  const api: API = app.api;
  const context = {};

  expressApp.delete('/users/:username', function(
    req: express$Request,
    res: express$Response,
    next: express$NextFunction
  ) {
    context.username = req.params.username;
    context.authorizationKey = req.headers.authorization;

    api.call(
      'auth.delete',
      context,
      req.params,
      methodCallback(res, next, 200)
    );
  });
};
