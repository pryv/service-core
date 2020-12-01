/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const Registration = require('components/business/src/auth/registration');
const commonFns = require('./../helpers/commonFunctions');
const methodsSchema = require('components/api-server/src/schema/authMethods');
const UsersRepository = require('components/business/src/users/repository');
const errors = require('components/errors').factory;

/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function (api, logging, storageLayer, servicesSettings) {
  // REGISTER
  const registration = new Registration(logging, storageLayer, servicesSettings);
  const usersRepository = new UsersRepository(storageLayer.events);

  api.register('auth.register.dnsless',
    // data validation methods
    commonFns.getParamsValidation(methodsSchema.register.params),
    // user registration methods
    registration.prepareUserData,
    registration.createUser.bind(registration),
    registration.buildResponse.bind(registration),
    registration.sendWelcomeMail.bind(registration),
  );

  // Username check
  api.register('auth.usernameCheck.dnsless',
    commonFns.getParamsValidation(methodsSchema.usernameCheck.params),
    checkUsername
  );

  /**
   * Check in service-register if user id is reserved
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function checkUsername(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    result.reserved = false;
    try {
      const existingUsers = await usersRepository.findExistingUniqueFields({ username: params.username});

      if (existingUsers.length > 0) {
        return next(errors.itemAlreadyExists('user', { username: params.username }));
      }
      result.reserved = false;
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }
};