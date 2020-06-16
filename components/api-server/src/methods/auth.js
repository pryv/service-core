const commonFns = require('./helpers/commonFunctions');
const utils = require('components/utils');

const { encryption } = utils;
const errors = require('components/errors').factory;
const _ = require('lodash');
const methodsSchema = require('../schema/authMethods');

/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function (api, userAccessesStorage, sessionsStorage, authSettings) {
  // LOGIN

  api.register('auth.login',
    commonFns.getParamsValidation(methodsSchema.login.params),
    commonFns.getTrustedAppCheck(authSettings),
    applyPrerequisitesForLogin,
    checkPassword,
    openSession,
    updateOrCreatePersonalAccess,
    setAdditionalInfo);

  function applyPrerequisitesForLogin(context, params, result, next) {
    const fixedUsername = params.username.toLowerCase();
    if (context.user.username !== fixedUsername) {
      return next(errors.invalidOperation('The username in the path does not match that of '
          + 'the credentials.'));
    }
    next();
  }

  function checkPassword(context, params, result, next) {
    encryption.compare(params.password, context.user.passwordHash, (err, isValid) => {
      if (err) { return next(errors.unexpectedError(err)); }

      if (!isValid) {
        return next(errors.invalidCredentials());
      }
      next();
    });
  }

  function openSession(context, params, result, next) {
    context.sessionData = {
      username: context.user.username,
      appId: params.appId,
    };
    sessionsStorage.getMatching(context.sessionData, (err, sessionId) => {
      if (err) { return next(errors.unexpectedError(err)); }
      if (sessionId) {
        result.token = sessionId;
        next();
      } else {
        sessionsStorage.generate(context.sessionData, (err, sessionId) => {
          if (err) { return next(errors.unexpectedError(err)); }
          result.token = sessionId;
          next();
        });
      }
    });
  }

  function updateOrCreatePersonalAccess(context, params, result, next) {
    context.accessQuery = { name: params.appId, type: 'personal' };
    // a
    findAccess(context, (err, access) => {
      if (err) { return next(errors.unexpectedError(err)); }
      const accessData = { token: result.token };
      // Access is already existing, updating it with new token (as we have updated the sessions with it earlier).
      if (access != null) {
        updatePersonalAccess(accessData, context, next);
      }
      // Access not found, creating it
      else {
        // b
        createAccess(accessData, context, (err) => {
          if (err != null) {
            // Concurrency issue, the access is already created
            // by a simultaneous login (happened between a & b), retrieving and updating its modifiedTime, while keeping the same previous token
            if (err.isDuplicate) {
              findAccess(context, (err, access) => {
                if (err || access == null) { return next(errors.unexpectedError(err)); }
                result.token = access.token;
                accessData.token = access.token;
                updatePersonalAccess(accessData, context, next);
              });
            } else {
              // Any other error
              return next(errors.unexpectedError(err));
            }
          } else {
            next();
          }
        });
      }
    });

    function findAccess(context, callback) {
      userAccessesStorage.findOne(context.user, context.accessQuery, null, callback);
    }

    function createAccess(access, context, callback) {
      _.extend(access, context.accessQuery);
      context.initTrackingProperties(access, 'system');
      userAccessesStorage.insertOne(context.user, access, callback);
    }

    function updatePersonalAccess(access, context, callback) {
      context.updateTrackingProperties(access, 'system');
      userAccessesStorage.updateOne(context.user, context.accessQuery, access, callback);
    }
  }

  function setAdditionalInfo(context, params, result, next) {
    result.preferredLanguage = context.user.language;
    next();
  }

  // LOGOUT

  api.register('auth.logout',
    commonFns.getParamsValidation(methodsSchema.logout.params),
    destroySession);

  function destroySession(context, params, result, next) {
    sessionsStorage.destroy(context.accessToken, (err) => {
      next(err ? errors.unexpectedError(err) : null);
    });
  }
};
module.exports.injectDependencies = true;
