var commonFns = require('./helpers/commonFunctions'),
    Database = require('components/storage').Database,
    utils = require('components/utils'),
    encryption = utils.encryption,
    errors = require('components/errors').factory,
    methodsSchema = require('../schema/authMethods'),
    _ = require('lodash');

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
      updateOrCreateAccess,
      setAdditionalInfo);

  function applyPrerequisitesForLogin(context, params, result, next) {
    var fixedUsername = params.username.toLowerCase();
    if (context.user.username !== fixedUsername) {
      return next(errors.invalidOperation('The username in the path does not match that of ' +
          'the credentials.'));
    }
    next();
  }

  function checkPassword(context, params, result, next) {
    encryption.compare(params.password, context.user.passwordHash, function (err, isValid) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (! isValid) {
        return next(errors.invalidCredentials());
      }
      next();
    });
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
        sessionsStorage.generate(context.sessionData, function (err, sessionId) {
          if (err) { return next(errors.unexpectedError(err)); }

          result.token = sessionId;
          next();
        });
      }
    });
  }

  function updateOrCreateAccess(context, params, result, next) {
    context.accessQuery = { name: params.appId, type: 'personal' };
    findAccess(context, (err, access) => {
      if (err) { return next(errors.unexpectedError(err)); }
      
      var accessData = {token: result.token};
      // can't use Mongo upsert as we want control over the id
      if (access != null) {
        updateAccess(accessData, context, next);
      } else {
        createAccess(accessData, context, (err) => {
          if (err) {
            if (Database.isDuplicateError(err)) {
              // Concurrency issue, the access is already created
              // by a simultaneous login, nothing to do
              findAccess(context, (err, access) => {
                if (err || access == null) { return next(errors.unexpectedError(err)); }
                updateAccess(accessData, context, next);
              });
            } else {
              return next(errors.unexpectedError(err));
            }
          }
          next();
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
    
    function updateAccess(access, context, callback) {
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
      //TODO: optimize by only loading the access itself (no need for expansion etc.)
      commonFns.loadAccess,
      commonFns.getParamsValidation(methodsSchema.logout.params),
      destroySession);

  function destroySession(context, params, result, next) {
    sessionsStorage.destroy(context.accessToken, function (err) {
      next(err ? errors.unexpectedError(err) : null);
    });
  }

};
module.exports.injectDependencies = true;
