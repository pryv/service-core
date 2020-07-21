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
  const serviceRegisterConn = new ServiceRegister(servicesSettings.register, logging.getLogger('service-register'));
  const RegistrationService = new Register();

  api.register('auth.register',
    // data validation methods
    commonFns.getParamsValidation(methodsSchema.register.params),

    setDefaultValues,
    validateUserInServiceRegister,

    // user registration methods
    prepareUserDataForSaving,
    validateThatUserDoesNotExistInLocalDb,
    reserveUserInServiceRegister,
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
  async function setDefaultValues(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!params.invitationtoken) {
      params.invitationtoken = 'no-token';
    }
    if (!params.languageCode) {
      params.languageCode = 'en';
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
  async function validateThatUserDoesNotExistInLocalDb(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-core
      const existingUser = await bluebird.fromCallback(
        (cb) => usersStorage.findOne({ $or: [ {email: params.email}, {username: params.username} ] }, null, cb)
      );

      // if email was already saved, it means that there were an error 
      // saving in service register (above there is a check that email does not exist in
      // service register)
      if (existingUser?.username) {
        // skip all steps exept registrattion in service-register and welcome email
        context.skip = true;
        
        //append context with the same values that would be saved by createUser function
        context.user = {
          username: existingUser.username,
          email: existingUser.email,
          invitationtoken: existingUser.invitationtoken,
          language: existingUser.language,
          referer: existingUser.referer,
          appId: existingUser.appId,
          id: existingUser.id
        };

        // set result as current username
        result.username = existingUser.username;
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
    
    // change parameter name
    params.language = params.languageCode;
    delete params.languageCode;
    
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


  /**
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function reserveUserInServiceRegister(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(context.skip === true){ return next()};
    try {
      const canRegister: Boolean = await serviceRegisterConn.reserveUser(params.username, context.hostname);

      if (canRegister === false) {
        return next(errors.DuplicatedUserRegistration());
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
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

      if(response?.reserved){
        result.reserved = response.reserved;
      }
      if(response?.reason){
        result.reason = response.reason;
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

};
module.exports.injectDependencies = true;