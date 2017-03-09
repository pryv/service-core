'use strict';
// @flow

const cookieParser = require('cookie-parser');
const R = require('ramda');
const express = require('express');

const errors = require('components/errors').factory;

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');

/**
 * Auth routes.
 *
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp: express$Application, api: any, authSettings: Object, httpSettings: Object) {
  const ms14days = 1000 * 60 * 60 * 24 * 14;
  const sessionMaxAge = authSettings.sessionMaxAge || ms14days;
  const ssoCookieDomain = authSettings.ssoCookieDomain || httpSettings.ip;
  const ssoCookieSignSecret = authSettings.ssoCookieSignSecret || 'Hallowed Be Thy Name, O Node';
  const ssoCookieSecure = process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';

  function hasProperties(obj: mixed, keys: Array<string>): boolean {
    if (obj == null) { return false; }
    if (typeof obj !== 'object') { return false; }
    
    return R.all(
      R.has(R.__, obj),
      keys
    ); 
  }
  function setSSOCookie(data, res) {
    res.cookie('sso', data, {
      domain: ssoCookieDomain,
      maxAge: sessionMaxAge,
      secure: ssoCookieSecure,
      signed: true,
      httpOnly: false
    });
  }
  function clearSSOCookie(res) {
    res.clearCookie('sso', {
      domain: ssoCookieDomain,
      secure: ssoCookieSecure,
      httpOnly: false
    });
  }
  function defineRoutes(router) {
    // Define local routes
    router.all('*', cookieParser(ssoCookieSignSecret));
    router.get('/who-am-i', function routeWhoAmI(req: express$Request, res, next) {
      var ssoCookie = req.signedCookies.sso;
      if (! ssoCookie || typeof ssoCookie !== 'object') {
        return next(errors.invalidCredentials('Not signed-on'));
      }

      res.json({
        username: ssoCookie.username,
        token: ssoCookie.token
      }, 200);
    });
    router.post('/login', function routeLogin(req: express$Request, res, next) {
      if (typeof req.body !== 'object' || req.body == null ||
        ! hasProperties(req.body, ['username', 'password', 'appId'])) {
        return next(errors.invalidOperation('Missing parameters: username, password and appId are required.'));
      }
      const body: Object = req.body; 
      
      var params = {
        username: body.username,
        password: body.password,
        appId: body.appId,
        origin: req.headers.origin || ''
      };
      api.call('auth.login', req.context, params, function (err, result) {
        if (err) { return next(err); }
        setSSOCookie({ username: req.context.username, token: result.token }, res);
        res.json(result, 200);
      });
    });
    router.post('/logout', function routeLogout(req: express$Request, res, next) {
      clearSSOCookie(res);
      api.call('auth.logout', req.context, {}, methodCallback(res, next, 200));
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
module.exports.injectDependencies = true;
