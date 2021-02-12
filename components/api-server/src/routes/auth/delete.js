/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('../methodCallback');
const API = require('../../API');
import type Application  from '../../application';
const { getConfigUnsafe } = require('@pryv/boiler');

const middleware = require('middleware');

/**
 * Routes for users
 * @param app
 */
module.exports = function(expressApp: express$Application, app: Application) {
  const api: API = app.api;
  

  const initContextMiddleware = middleware.initContext(app.storageLayer);
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.delete('/users/:username', 
  initContextMiddleware,
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
    req.context.username = req.params.username;
    req.context.authorizationHeader = req.headers.authorization;
    const isOpensource = getConfigUnsafe().get('openSource:isActive');

    if (isOpensource) {
      api.call(
        'auth.delete.opensource',
        req.context,
        req.params,
        methodCallback(res, next, 200)
      );
    }else{
      api.call(
        'auth.delete',
        req.context,
        req.params,
        methodCallback(res, next, 200)
      );
    }
  });
};
