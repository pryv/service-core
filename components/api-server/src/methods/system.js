var errors = require('components/errors').factory,
    commonFns = require('./helpers/commonFunctions'),
    errorHandling = require('components/errors').errorHandling,
    methodsSchema = require('../schema/systemMethods'),
    request = require('superagent'),
    string = require('./helpers/string'),
    util = require('util'),
    _ = require('lodash');

/**
 * @param systemAPI
 * @param usersStorage
 * @param userAccessesStorage
 * @param servicesSettings Must contain `email`
 * @param api The user-facing API, used to compute usage stats per method
 * @param logging
 */
module.exports = function (systemAPI, usersStorage, userAccessesStorage, servicesSettings, api,
                           logging) {

  var logger = logging.getLogger('methods/system');

  systemAPI.register('system.createUser',
      commonFns.getParamsValidation(methodsSchema.createUser.params),
      applyDefaultsForCreation,
      createUser,
      sendWelcomeMail);

  function applyDefaultsForCreation(context, params, result, next) {
    params.storageUsed = {
      dbDocuments: 0,
      attachedFiles: 0
    };
    next();
  }

  function createUser(context, params, result, next) {
    if (params.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user = _.defaults({id: result.id}, params);
      next();
    } else {
      usersStorage.insertOne(params, function (err, newUser) {
        if (err) {
          // for now let's just assume the user already exists
          return next(errors.itemAlreadyExists(
            'user', {username: params.username}, err
          ));
        }
        result.id = newUser.id;
        context.user = newUser;
        next();
      });
    }
  }

  var emailSettings = servicesSettings.email,
      sendMailURL = emailSettings.url + emailSettings.sendMessagePath;

  function sendWelcomeMail(context, params, result, next) {
    // skip this step if welcome mail is deactivated
    const isMailActivated = emailSettings.enabled;
    if(isMailActivated === false
      || (isMailActivated != null && isMailActivated.welcome === false)) {
      return next();
    }
    var sendMailData = {
      key: emailSettings.key,
      template_name: emailSettings.welcomeTemplate,
      template_content: [],
      message: {
        to: [
          {
            email: context.user.email,
            name: context.user.username,
            type: 'to'
          }
        ],
        global_merge_vars: [
          {
            name: 'USERNAME',
            content: context.user.username
          },
          {
            name: 'EMAIL',
            content: context.user.email
          }
        ],
        tags: ['welcome']
      }
    };
    request.post(sendMailURL).send(sendMailData).end(function (err, res) {
      if (err || ! res.ok) {
        if (! err) {
          err = new Error('Sending welcome e-mail failed: ' + util.inspect(res.body));
        }
        // don't fail creation process itself (mail isn't critical), just log error
        errorHandling.logError(err, null, logger);
      }

      next();
    });
  }

  systemAPI.register('system.getUserInfo',
      commonFns.getParamsValidation(methodsSchema.getUserInfo.params),
      retrieveUser,
      getUserInfoInit,
      getUserInfoSetAccessStats);

  function retrieveUser(context, params, result, next) {
    usersStorage.findOne({username: params.username}, null, function (err, user) {
      if (err) { return next(errors.unexpectedError(err)); }
      if (! user) {
        return next(errors.unknownResource('user', this.username));
      }

      context.user = user;
      next();
    });
  }

  function getUserInfoInit(context, params, result, next) {
    result.userInfo = {
      username: context.user.username,
      storageUsed: context.user.storageUsed
    };
    next();
  }

  function getUserInfoSetAccessStats(context, params, result, next) {
    var info = _.defaults(result.userInfo, {
      lastAccess: 0,
      callsTotal: 0,
      callsDetail: {},
      callsPerAccess: {}
    });
    getAPIMethodKeys().forEach(function (methodKey) {
      info.callsDetail[methodKey] = 0;
    });

    userAccessesStorage.find(context.user, {}, null, function (err, accesses) {
      if (err) { return next(errors.unexpectedError(err)); }

      accesses.forEach(function (access) {
        if (access.lastUsed > info.lastAccess) {
          info.lastAccess = access.lastUsed;
        }

        var accessKey = getAccessStatsKey(access);
        if (! info.callsPerAccess[accessKey]) {
          info.callsPerAccess[accessKey] = 0;
        }
        if (access.calls) {
          _.forOwn(access.calls, function (total, methodKey) {
            info.callsTotal += total;
            info.callsDetail[methodKey] += total;
            info.callsPerAccess[accessKey] += total;
          });
        }
      });

      next();
    });
  }

  var apiMethodKeys = null;
  function getAPIMethodKeys() {
    if (! apiMethodKeys) {
      apiMethodKeys = Object.keys(api.map).map(string.toMongoKey);
    }
    return apiMethodKeys;
  }

  function getAccessStatsKey(access) {
    if (access.type === 'shared') {
      // don't leak user private data
      return 'shared';
    } else {
      return access.name;
    }
  }

};
module.exports.injectDependencies = true;
