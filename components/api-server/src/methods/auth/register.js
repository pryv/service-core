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
const encryption = require('components/utils').encryption;
const bluebird = require('bluebird');
const ServiceRegister = require('components/business/src/auth/service_register');
const Register = require('components/business/src/auth/registration');

import type { MethodContext } from 'components/model';
type GenericCallback<T> = (err?: ?Error, res: ?T) => mixed;
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
module.exports = function (api, usersStorage, logging, storageLayer, servicesSettings, serverSettings) {
  // REGISTER
  const serviceRegisterConn = new ServiceRegister(servicesSettings.register);
  const RegistrationService = new Register();

  api.register('auth.register',
    // data validation methods
    commonFns.getParamsValidation(methodsSchema.register.params),
    // TODO IEVA? commonFns.getTrustedAppCheck(authSettings),

    setDefaultInvitationTokenValue,
    validateUserInServiceRegister,

    // user registration methods
    prepareUserDataForSaving,
    RegistrationService.applyDefaultsForCreation,
    RegistrationService.createUser,
    RegistrationService.createUserInServiceRegister,
    RegistrationService.sendWelcomeMail
  );

  /**
   * Check in service-register if invitation token is valid
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function setDefaultInvitationTokenValue(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!params.invitationtoken) {
      params.invitationtoken = 'no-token';
    }
    next();
  }

  /**
   * Check in service-register if uid already exists
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function doesUidAlreadyExist(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-register
      const exists: Boolean = await serviceRegisterConn.uidExist(params.username);
      if (exists) {
        context.errors.push(errors.ExistingUsername());
        // do not continue to search in core database
        return next();
      }
      // check username in service-core
      // TODO IEVA - with streams this should be replaced so that it is not counting but searching for existance
      const usernameExists = await bluebird.fromCallback(
        (cb) => usersStorage.count({ username: params.username }, cb)
      );
      // username was already used
      if (usernameExists >= 1) {
        context.errors.push(errors.ExistingUsername());
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * Check in service-register if email already exists
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function doesEmailAlreadyExist(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-register
      const exists: Boolean = await serviceRegisterConn.emailExists(params.email);
      if (exists) {
        context.errors.push(errors.ExistingEmail());
        // do not continue to search in core database
        return next();
      }

      // check email in service-core
      // TODO IEVA - with streams this should be replaced so that it is not counting but searching for existance
      const emailExists = await bluebird.fromCallback(
        (cb) => usersStorage.count({ email: params.email }, cb)
      );
      // email was already used
      if (emailExists >= 1) {
        context.errors.push(errors.ExistingEmail());
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function validateUserInServiceRegister(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const response = await serviceRegisterConn.validateUser(params.email, params.username, params.invitationtoken);

      if (response?.errors && response.errors.length > 0) {
        // 1. convert list of error ids to the list of api errors
        const listApiErrors = response.errors.map(err => {
          return errors[err]();
        });

        // 2. convert api errors to validation errors
        return next(commonFns.apiErrorToValidationErrorsList(listApiErrors));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function prepareUserDataForSaving(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    params.username = params.username.toLowerCase();
    params.email = params.email.toLowerCase();

    // Construct the request for core, including the password. 
    params.passwordHash = await encryption.hash(params.password);
    context.usersStorage = usersStorage;
    context.storageLayer = storageLayer;
    context.servicesSettings = servicesSettings;
    context.hostname = serverSettings.hostname;
    context.logger = logging.getLogger('methods/system');
    context.POOL_USERNAME_PREFIX = 'pool@';
    context.TEMP_USERNAME_PREFIX = 'temp@';
    context.POOL_REGEX = new RegExp('^' + context.POOL_USERNAME_PREFIX);
    next();
  }

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
      result = response;
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    // TODO IEVA - additional parameters now appear
    /*
    "meta": {
        "apiVersion": "1.2.3",
        "serverTime": 1594915058.634,
        "serial": "2019061301"
    },
    */

    result.reserved = false;
    next();
  }

};
module.exports.injectDependencies = true;