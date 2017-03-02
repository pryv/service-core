var errors = require('components/errors').factory,
    validation = require('../../schema/validation');

exports.loadAccess = function loadAccess(context, params, result, next) {
  context.retrieveExpandedAccess(next);
};

exports.requirePersonalAccess = function requirePersonalAccess(context, params, result, next) {
  if (! context.access.isPersonal()) {
    return next(errors.forbidden('You cannot access this resource using the given access ' +
        'token.'));
  }
  next();
};

/**
 * Returns a check whether the given app ID / origin pair match a trusted app defined in settings.
 * (Lazy-loads and caches the `trustedApps` setting.)
 * The returned function expects the call's `params` to have `appId` and `origin` properties.
 *
 * @param {Object} authSettings
 * @return {Function}
 */
exports.getTrustedAppCheck = function getTrustedAppCheck(authSettings) {
  var trustedApps;

  return function requireTrustedApp(context, params, result, next) {
    if (! isTrustedApp(params.appId, params.origin)) {
      return next(errors.invalidCredentials('The app id ("appId") is either missing or ' +
          'not trusted.'));
    }
    next();
  };

  function isTrustedApp(appId, origin) {
    if (! trustedApps) {
      trustedApps = [];
      authSettings.trustedApps.split(',').forEach(function (pair) {
        var parts = /^\s*(\S+)\s*@\s*(\S+)\s*$/.exec(pair);
        if (parts.length !== 3) { return; }
        trustedApps.push({
          appId: parts[1], // index 0 is the original string
          originRegExp: getRegExp(parts[2])
        });
      });
    }

    if (! appId) { return false; }

    var trustedApp;
    for (var i = 0, n = trustedApps.length; i < n; i++) {
      trustedApp = trustedApps[i];
      // accept wildcards for app ids (for use in tests/dev/staging only)
      if (trustedApp.appId !== appId && trustedApp.appId !== '*') {
        continue;
      }
      if (trustedApp.originRegExp.test(origin)) {
        return true;
      }
    }

    return false;
  }

  function getRegExp(origin) {
    // first escape the origin string
    var rxString = origin.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
    // then replace wildcards
    rxString = rxString.replace(/\\\*/g, '\\S*');
    return new RegExp('^' + rxString + '$');
  }
};

exports.getParamsValidation = function getParamsValidation(paramsSchema) {
  return function validateParams(context, params, result, next) {
    validation.validate(params, paramsSchema, function (err) {
      if (err) {
        return next(errors.invalidParametersFormat('The parameters\' format is invalid.',
            err));
      }
      next();
    });
  };
};
