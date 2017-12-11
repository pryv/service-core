var methodCallback = require('./methodCallback'),
    errors = require('components/errors').factory,
    express = require('express'),
    Paths = require('./Paths');

/**
 * Auth routes.
 *
 * @param {Object} expressApp
 * @param {Object} api The API object for registering methods
 * @param {Object} authSettings
 * @param {Object} httpSettings
 */
module.exports = function (expressApp, api, authSettings, httpSettings) {
  var sessionMaxAge = authSettings.sessionMaxAge || 1000 * 60 * 60 * 24 * 14, // 14 days
      ssoCookieDomain = authSettings.ssoCookieDomain || httpSettings.ip,
      ssoCookieSignSecret = authSettings.ssoCookieSignSecret || 'Hallowed Be Thy Name, O Node',
      ssoCookieSecure = process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';

  expressApp.all(Paths.Auth + '/*', express.cookieParser(ssoCookieSignSecret));

  expressApp.get(Paths.Auth + '/who-am-i', function (req, res, next) {
    var ssoCookie = req.signedCookies.sso;
    if (! ssoCookie) {
      return next(errors.invalidCredentials(
        'Not signed-on'
      ));
    }

    res.json({
      username: ssoCookie.username,
      token: ssoCookie.token
    }, 200);
  });

  expressApp.post(Paths.Auth + '/login', function (req, res, next) {
    var params = {
      username: req.body.username,
      password: req.body.password,
      appId: req.body.appId,
      origin: req.headers.origin || ''
    };
    hidePasswordIfExists(req.body);
    api.call('auth.login', req.context, params, function (err, result) {
      if (err) { return next(err); }
      setSSOCookie({ username: req.context.username, token: result.token }, res);
      result.writeToHttpResponse(res, 200);
    });
  });

  function setSSOCookie(data, res) {
    res.cookie('sso', data, {
      domain: ssoCookieDomain,
      maxAge: sessionMaxAge,
      secure: ssoCookieSecure,
      signed: true,
      httpOnly: false
    });
  }

  expressApp.post(Paths.Auth + '/logout', function (req, res, next) {
    clearSSOCookie(res);
    api.call('auth.logout', req.context, {}, methodCallback(res, next, 200));
  });

  function clearSSOCookie(res) {
    res.clearCookie('sso', {
      domain: ssoCookieDomain,
      secure: ssoCookieSecure,
      httpOnly: false
    });
  }

  function hidePasswordIfExists(requestBody) {
    if (requestBody.password) {
      requestBody.password = '(hidden)';
    }
    // don't set it if no value was provided
  }

};
module.exports.injectDependencies = true;
