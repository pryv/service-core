/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
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

import type Application from './../application';

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
  const ssoCookieDomain: string =
    config.get('auth:ssoCookieDomain') || config.get('http:ip');
  const ssoCookieSignSecret: string =
    config.get('auth:ssoCookieSignSecret') || 'Hallowed Be Thy Name, O Node';
  const ssoCookieSecure: boolean =
    process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';
  const ssoHttpOnly: boolean = true;

  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  // Returns true if the given `obj` has all of the property values identified
  // by the names contained in `keys`.
  //
  function hasProperties(obj: unknown, keys: Array<string>): boolean {
    if (obj == null) {
      return false;
    }
    if (typeof obj !== 'object') {
      return false;
    }

    for (const key of keys) {
      if (!lodash.has(obj, key)) return false;
    }
    return true;
  }

  function setSSOCookie(data: any, res) {
    res.cookie('sso', data, {
      domain: ssoCookieDomain,
      maxAge: sessionMaxAge,
      secure: ssoCookieSecure,
      signed: true,
      httpOnly: ssoHttpOnly,
    });
  }
  function clearSSOCookie(res) {
    res.clearCookie('sso', {
      domain: ssoCookieDomain,
      secure: ssoCookieSecure,
      httpOnly: ssoHttpOnly,
    });
  }

  // Define local routes
  expressApp.all(Paths.Auth + '*', cookieParser(ssoCookieSignSecret));
  expressApp.get(
    Paths.Auth + '/who-am-i',
    function routeWhoAmI(req: express$Request, res, next) {
      return next(errors.goneResource());
    }
  );
  expressApp.post(
    Paths.Auth + '/login',
    setMethodId('auth.login'),
    function routeLogin(req: RequestWithContext, res, next) {
      if (
        typeof req.body !== 'object' ||
        req.body == null ||
        !hasProperties(req.body, ['username', 'password', 'appId'])
      ) {
        return next(
          errors.invalidOperation(
            'Missing parameters: username, password and appId are required.'
          )
        );
      }
      const body: any = req.body;

      const params = {
        username: body.username,
        password: body.password,
        appId: body.appId,
        // some browsers provide origin, some provide only referer
        origin: req.headers.origin || req.headers.referer || '',
      };

      api.call(req.context, params, function (err, result) {
        if (err) return next(err);
        setSSOCookie(
          { username: req.context.user.username, token: result.token },
          res
        );
        methodCallback(res, next, 200)(err, result);
      });
    }
  );
  expressApp.post(
    Paths.Auth + '/logout',
    setMethodId('auth.logout'),
    loadAccessMiddleware,
    function routeLogout(req: RequestWithContext, res, next) {
      clearSSOCookie(res);
      api.call(req.context, {}, methodCallback(res, next, 200));
    }
  );

  return {
    hasProperties: hasProperties,
  };
};
