/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const cookieParser = require('cookie-parser');
const lodash = require('lodash');
const express = require('express');

const errors = require('errors').factory;
const middleware = require('middleware');
const { setMethodId } = require('middleware');

const methodCallback = require('../methodCallback');
const Paths = require('../Paths');

declare class RequestWithContext extends express$Request {
  context: any; 
}


import type Application  from './../application';

const { getConfigUnsafe } = require('@pryv/boiler');

/**
 * Auth routes.
 *
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp: express$Application, app: Application) {
  const config = getConfigUnsafe();
  const api = app.api;

  const ms14days: number = 1000 * 60 * 60 * 24 * 14;
  const sessionMaxAge: number = config.get('auth:sessionMaxAge') || ms14days;
  const ssoCookieDomain: string = config.get('auth:ssoCookieDomain') || config.get('http:ip');
  const ssoCookieSignSecret: string = config.get('auth:ssoCookieSignSecret') || 'Hallowed Be Thy Name, O Node';
  const ssoCookieSecure: boolean = process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test' ;
  const ssoHttpOnly: boolean = true ;

  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  // Returns true if the given `obj` has all of the property values identified
  // by the names contained in `keys`.
  //
  function hasProperties(obj: mixed, keys: Array<string>): boolean {
    if (obj == null) { return false; }
    if (typeof obj !== 'object') { return false; }
    
    for (const key of keys) {
      if (! lodash.has(obj, key)) return false; 
    }
    return true; 
  }

  function setSSOCookie(data: Object, res) {
    res.cookie('sso', data, {
      domain: ssoCookieDomain,
      maxAge: sessionMaxAge,
      secure: ssoCookieSecure,
      signed: true,
      httpOnly: ssoHttpOnly
    });
  }
  function clearSSOCookie(res) {
    res.clearCookie('sso', {
      domain: ssoCookieDomain,
      secure: ssoCookieSecure,
      httpOnly: ssoHttpOnly
    });
  }
  function defineRoutes(router) {
    // Define local routes
    router.all('*', cookieParser(ssoCookieSignSecret));
    router.get('/who-am-i', function routeWhoAmI(req: express$Request, res, next) {
      return next(errors.goneResource());
    });
    router.post('/login', 
      setMethodId('auth.login'),
      function routeLogin(req: RequestWithContext, res, next) {
        if (typeof req.body !== 'object' || req.body == null ||
          ! hasProperties(req.body, ['username', 'password', 'appId'])) {
          return next(errors.invalidOperation('Missing parameters: username, password and appId are required.'));
        }
        const body: Object = req.body; 
        
        const params = {
          username: body.username,
          password: body.password,
          appId: body.appId,
          // some browsers provide origin, some provide only referer
          origin: req.headers.origin || req.headers.referer || ''
        };
        
        api.call(req.context, params, function (err, result) {
          if (err) return next(err);
          setSSOCookie({ username: req.context.username, token: result.token }, res);
          methodCallback(res, next, 200)(err, result);
        });

    });
    router.post('/logout',
      setMethodId('auth.logout'),
      loadAccessMiddleware,
      function routeLogout(req: RequestWithContext, res, next) {
        clearSSOCookie(res);
        api.call(req.context, {}, methodCallback(res, next, 200));
      });
  }
  
  // Create a router that is relative to /:username/auth/
  const router = express.Router(); 
  expressApp.use(Paths.Auth, router);
  
  defineRoutes(router);
  
  return {
    hasProperties: hasProperties, 
  };
};
