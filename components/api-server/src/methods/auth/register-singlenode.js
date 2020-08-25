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
const UserService = require('components/business/src/users/User');
const errors = require('components/errors').factory;

/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function (api, logging, storageLayer, servicesSettings, serverSettings) {
  // REGISTER
  const registration = new Registration(logging, storageLayer, servicesSettings, serverSettings);

  api.register('auth.register.singlenode',
    // data validation methods
    registration.prepareUserData,
    registration.loadCustomValidationSettings.bind(registration),
    registration.prepareUserDataForSaving,
    // user registration methods
    registration.prepareUserDataForSaving,
    registration.createUser.bind(registration),
    registration.sendWelcomeMail.bind(registration),
  );

  // Username check
  api.register('auth.usernameCheck.singlenode',
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
      const userService = new UserService({ storage: storageLayer.events });
      const existingUser = await userService.checkUserFieldsUniqueness({ username: params.username});

      if (existingUser?.content) {
        result.reserved = true;
        return next(errors.itemAlreadyExists('username', { username: params.username }));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }
};