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
  logging, storageLayer, serverSettings
) {

  const POOL_REGEX = new RegExp('^' + 'pool@');
  const registration = new Registration(logging, storageLayer, servicesSettings, serverSettings);

  // ---------------------------------------------------------------- createUser
  systemAPI.register('system.createUser',
    commonFns.getParamsValidation(methodsSchema.createUser.params),
    registration.prepareUserDataForSaving,
    validateUserExistanceInTheDatabase,
    registration.createUser,
    registration.sendWelcomeMail
    );

  /**
 * Check in service-register if email already exists
 * @param {*} context 
 * @param {*} params 
 * @param {*} result 
 * @param {*} next 
 */
  async function validateUserExistanceInTheDatabase(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-core
      const existingUser = await bluebird.fromCallback(
        (cb) => storageLayer.events.findOne({},
          {
            $or: [{ $and: [{ streamIds: 'username' }, { content: params.username }] },
            { $and: [{ streamIds: 'email' }, { content: params.email }] }]
          },
          null, cb)
      );

      // if email was already saved, throw an error
      if (existingUser?.streamIds) {
        if (existingUser.streamIds.includes('username')) {
          return next(errors.itemAlreadyExists('user', { username: params.username }));
        }
        if (existingUser.streamIds.includes('email')) {
          return next(errors.itemAlreadyExists('user', { email: params.email }));
        }
        // Any other error
        return next(errors.unexpectedError('Unexpected error while saving user.'));
      }
    } catch (error) {
      return next(errors.unexpectedError(error, 'Unexpected error while saving user.'));
    }
    next();
  }

  // ------------------------------------------------------------ createPoolUser
  systemAPI.register('system.createPoolUser',
    registration.createPoolUser,
    registration.createUser
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
            { streamIds: 'username' },
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
      // get userId by his username
      const userId = await storageLayer.events.getUserIdByUsername(params.username);

      if (!userId) {
        return next(errors.unknownResource('user', params.username));
      }
      context.user = await storageLayer.events.getUserInfo({
        user: { id: userId },
        getAll: false
      });
      context.user.id = userId;

      if (! context.user) {
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
