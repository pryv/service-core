/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('../methodCallback');
const API = require('../../API');
import type Application  from '../../application';
const { getConfigUnsafe } = require('@pryv/boiler');

const middleware = require('middleware');
const { setMethodId } = require('middleware');

/**
 * Routes for users
 * @param app
 */
module.exports = function(expressApp: express$Application, app: Application) {
  const api: API = app.api;
  

  const initContextMiddleware = middleware.initContext(app.storageLayer);
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);
  
  expressApp.delete('/users/:username',
    middleware.getAuth,
    initContextMiddleware,
    setMethodId('auth.delete'),
    function (req, res, next) {
      loadAccessMiddleware(req, res, function (err) { 
        // ignore errors as a valid adminAuthentication token might be presented
        next();
      });
    },
    function callMethodAuthDelete(
      req: express$Request,
      res: express$Response,
      next: express$NextFunction
    ) {
      req.context.user.username = req.params.username;
      req.context.authorizationHeader = req.headers.authorization;
      api.call(req.context, req.params, methodCallback(res, next, 200));
  });
};
