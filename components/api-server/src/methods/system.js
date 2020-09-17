/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('components/errors').factory;
const commonFns = require('./helpers/commonFunctions');
const Registration = require('components/business/src/auth/registration');
const methodsSchema = require('../schema/systemMethods');
const string = require('./helpers/string');
const _ = require('lodash');
const bluebird = require('bluebird');
const UserRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

/**
 * @param systemAPI
 * @param usersStorage
 * @param userAccessesStorage
 * @param servicesSettings Must contain `email`
 * @param api The user-facing API, used to compute usage stats per method
 * @param logging
 * @param storageLayer
 */
module.exports = function (
  systemAPI, userAccessesStorage, servicesSettings, api,
  logging, storageLayer
) {

  const POOL_REGEX = new RegExp('^' + 'pool@');
  const registration = new Registration(logging, storageLayer, servicesSettings);

  // ---------------------------------------------------------------- createUser
  systemAPI.register('system.createUser',
    commonFns.getParamsValidation(methodsSchema.createUser.params),
    registration.prepareUserData,
    registration.createUser.bind(registration),
    registration.sendWelcomeMail.bind(registration),
    );

  // ------------------------------------------------------------ createPoolUser
  systemAPI.register('system.createPoolUser',
    registration.prepareUserData,
    registration.createPoolUser.bind(registration),
    registration.createUser.bind(registration),
  );

  // ---------------------------------------------------------- getUsersPoolSize
  systemAPI.register('system.getUsersPoolSize',
    countPoolUsers);

  async function countPoolUsers(context, params, result, next) {
    //TODO Why temp user was overrden by pool user?
    try {
      const numUsers = await bluebird.fromCallback(cb => 
        storageLayer.events.count({}, {
          $and: [
            { streamIds: SystemStreamsSerializer.options.STREAM_ID_USERNAME },
            { content: { $regex: POOL_REGEX } }
          ]
        }, cb));
      result.size = numUsers ? numUsers : 0;
      return next();
    } catch (err) {
      return next(errors.unexpectedError(err))
    }
  }

  // --------------------------------------------------------------- getUserInfo
  systemAPI.register('system.getUserInfo',
    commonFns.getParamsValidation(methodsSchema.getUserInfo.params),
    retrieveUser,
    getUserInfoInit,
    getUserInfoSetAccessStats);

  async function retrieveUser(context, params, result, next) {
    try {
      const userRepository = new UserRepository(storageLayer.events);
      context.user = await userRepository.getAccountByUsername(params.username, true);

      if (! context.user?.id) {
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
