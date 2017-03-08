'use strict';
// @flow

const cookieParser = require('cookie-parser');
const R = require('ramda');

const errors = require('components/errors').factory;

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');

/**
 * Auth routes.
 *
 * @param {Object} expressApp
 * @param {Object} api The API object for registering methods
 * @param {Object} authSettings
 * @param {Object} httpSettings
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
  
  const route = expressApp.route(`${Paths.Auth}/`)
  route.all('*', cookieParser(ssoCookieSignSecret));
  route.get('who-am-i', function (req: express$Request, res, next) {
    var ssoCookie = req.signedCookies.sso;
    if (! ssoCookie) {
      return next(errors.invalidCredentials('Not signed-on'));
    }

    res.json({
      username: ssoCookie.username,
      token: ssoCookie.token
    }, 200);
  });
  route.post('login', function (req: express$Request, res, next) {
    var params = {
      username: req.body.username,
      password: req.body.password,
      appId: req.body.appId,
      origin: req.headers.origin || ''
    };
    api.call('auth.login', req.context, params, function (err, result) {
      if (err) { return next(err); }
      setSSOCookie({ username: req.context.username, token: result.token }, res);
      res.json(result, 200);
    });
  });
  route.post('logout', function (req: express$Request, res, next) {
    clearSSOCookie(res);
    api.call('auth.logout', req.context, {}, methodCallback(res, next, 200));
  });
  
  return {
    hasProperties: hasProperties, 
  };
};
module.exports.injectDependencies = true;
