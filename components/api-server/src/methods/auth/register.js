/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const commonFns = require('./../helpers/commonFunctions');
const errors = require('components/errors').factory;
const methodsSchema = require('components/api-server/src/schema/authMethods');
const ServiceRegister = require('components/business/src/auth/service_register');
const Registration = require('components/business/src/auth/registration');

import type { MethodContext } from 'components/model';
import type Result from '../Result';
import type { ApiCallback } from '../API';

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
  const serviceRegisterConn = new ServiceRegister(servicesSettings.register, logging.getLogger('service-register'));

  api.register('auth.register',
    // data validation methods
    registration.loadCustomValidationSettings,
    registration.validateUserInServiceRegister,

    // user registration methods
    registration.prepareUserDataForSaving,
    registration.validateThatUserDoesNotExistInLocalDb,
    registration.createUser,
    registration.createUserInServiceRegister,
    registration.sendWelcomeMail
  );
  
  // Username check
  api.register('auth.usernameCheck',
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
      const response = await serviceRegisterConn.checkUsername(params.username);

      if (response.reserved === true) {
        return next(errors.itemAlreadyExists('username', { username: params.username }));
      }

      if (response.reserved != null) {
        result.reserved = response.reserved;
      }
      
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

};