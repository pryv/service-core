/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const commonFns = require('components/api-server/src/methods/helpers/commonFunctions');
const utils = require('components/utils');
const errors = require('components/errors').factory;
const methodsSchema = require('components/api-server/src/schema/authMethods');
const _ = require('lodash');
const UsersRepository = require('components/business/src/users/repository');
const ErrorIds = require('components/errors/src/ErrorIds');
/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function (api, userAccessesStorage, sessionsStorage, userEventsStorage, authSettings) {
  const usersRepository = new UsersRepository(userEventsStorage);
  
  api.register('auth.login',
    commonFns.getParamsValidation(methodsSchema.login.params),
    commonFns.getTrustedAppCheck(authSettings),
    applyPrerequisitesForLogin,
    checkPassword,
    openSession,
    updateOrCreatePersonalAccess,
    setAdditionalInfo);

  function applyPrerequisitesForLogin(context, params, result, next) {
    var fixedUsername = params.username.toLowerCase();
    if (context.user.username !== fixedUsername) {
      return next(errors.invalidOperation('The username in the path does not match that of ' +
          'the credentials.'));
    }
    next();
  }

  async function checkPassword (context, params, result, next) {
    try {
      const isValid = await usersRepository.checkUserPassword(context.user.id, params.password);
      if (!isValid) {
        //TODO IEVA -different error than while changing the password
        return next(errors.invalidCredentials());
      }
      next();
    } catch (err) {
      // handles unexpected errors
      return next(err);
    }
  }

  function openSession(context, params, result, next) {
    context.sessionData = {
      username: context.user.username,
      appId: params.appId
    };
    sessionsStorage.getMatching(context.sessionData, function (err, sessionId) {
      if (err) { return next(errors.unexpectedError(err)); }
      if (sessionId) {
        result.token = sessionId;
        next();
      } else {
        sessionsStorage.generate(context.sessionData, null, function (err, sessionId) {
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
      var accessData = {token: result.token};
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
      context.initTrackingProperties(access, UsersRepository.options.SYSTEM_USER_ACCESS_ID);
      userAccessesStorage.insertOne(context.user, access, callback);
    }
    
    function updatePersonalAccess(access, context, callback) {
      context.updateTrackingProperties(access, UsersRepository.options.SYSTEM_USER_ACCESS_ID);
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
    sessionsStorage.destroy(context.accessToken, function (err) {
      next(err ? errors.unexpectedError(err) : null);
    });
  }

};
