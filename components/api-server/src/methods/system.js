/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('errors').factory;
const commonFns = require('./helpers/commonFunctions');
const Registration = require('business/src/auth/registration');
const methodsSchema = require('../schema/systemMethods');
const string = require('./helpers/string');
const _ = require('lodash');
const bluebird = require('bluebird');
const { getUsersRepository, User } = require('business/src/users');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { setAuditAccessId, AuditAccessIds } = require('audit/src/MethodContextUtils');

/**
 * @param systemAPI
 * @param usersStorage
 * @param userAccessesStorage
 * @param servicesSettings Must contain `email`
 * @param api The user-facing API, used to compute usage stats per method
 * @param logging
 * @param storageLayer
 */
module.exports = async function (
  systemAPI, userAccessesStorage, servicesSettings, api,
  logging, storageLayer
) {

  const registration = new Registration(logging, storageLayer, servicesSettings);
  const usersRepository = await getUsersRepository(); 
  const userProfileStorage = storageLayer.profile;

  // ---------------------------------------------------------------- createUser
  systemAPI.register('system.createUser',
    setAuditAccessId(AuditAccessIds.ADMIN_TOKEN),
    commonFns.getParamsValidation(methodsSchema.createUser.params),
    registration.prepareUserData,
    registration.createUser.bind(registration),
    registration.sendWelcomeMail.bind(registration),
    );

  // --------------------------------------------------------------- getUserInfo
  systemAPI.register('system.getUserInfo',
    setAuditAccessId(AuditAccessIds.ADMIN_TOKEN),
    commonFns.getParamsValidation(methodsSchema.getUserInfo.params),
    loadUserToMinimalMethodContext,
    getUserInfoInit,
    getUserInfoSetAccessStats);

  async function loadUserToMinimalMethodContext(minimalMethodContext, params, result, next) {
    try {
      minimalMethodContext.user = await usersRepository.getAccountByUsername(params.username, true);

      if (minimalMethodContext.user == null) {
        return next(errors.unknownResource('user', params.username));
      }
      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }

  function getUserInfoInit(context, params, result, next) {
    result.userInfo = {
      username: context.user.username,
      storageUsed: context.user.storageUsed
    };
    next();
  }

  function getUserInfoSetAccessStats(context, params, result, next) {
    const info = _.defaults(result.userInfo, {
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
      // Since we've merged new keys into _the old userInfo_ on result, we don't
      // need to return our result here, since we've modified the result in 
      // place. 

      next();
    });
  }

  // --------------------------------------------------------------- deactivateMfa
  systemAPI.register('system.deactivateMfa',
    setAuditAccessId(AuditAccessIds.ADMIN_TOKEN),
    commonFns.getParamsValidation(methodsSchema.deactivateMfa.params),
    loadUserToMinimalMethodContext,
    deactivateMfa
  );

  async function deactivateMfa(context, params, result, next) {
    try {
      await bluebird.fromCallback(cb => userProfileStorage.findOneAndUpdate(
        context.user, 
        {}, 
        { $unset: { 'data.mfa': '' } },
        cb));
    } catch (err) {
      return next(err);
    }
    next();
  };

  function getAPIMethodKeys() {
    return api.getMethodKeys().map(string.toMongoKey); 
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
