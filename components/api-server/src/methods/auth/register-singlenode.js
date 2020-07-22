/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const bluebird = require('bluebird');
const commonFns = require('./../helpers/commonFunctions');
const errors = require('components/errors').factory;
const methodsSchema = require('components/api-server/src/schema/authMethods');
const Register = require('components/business/src/auth/registration');

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
module.exports = function (api, usersStorage, logging, storageLayer, servicesSettings, serverSettings) {
  // REGISTER
  const RegistrationService = new Register();

  api.register('auth.register.singlenode',
    // data validation methods
    commonFns.getParamsValidation(methodsSchema.register.params),

    // set logger, database connection
    setContext,
    validateUser,
    RegistrationService.setDefaultValues,

    // user registration methods
    RegistrationService.prepareUserDataForSaving,
    RegistrationService.applyDefaultsForCreation,
    RegistrationService.createUser,
    RegistrationService.sendWelcomeMail
  );

  async function validateUser(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-core
      const existingUser = await bluebird.fromCallback(
        (cb) => context.usersStorage.findOne({ $or: [ {email: params.email}, {username: params.username} ] }, null, cb)
      );
      
      let listApiErrors = [];
      // if user is found
      if(existingUser?.username){
        // if username that matches, throws existing username error
        if (existingUser?.username == params.username) {
          listApiErrors.push(errors.ExistingUsername());
        }
        // if email that matches, throws existing email error
        if (existingUser?.email == params.email) {
          listApiErrors.push(errors.ExistingEmail());
        }
        return next(commonFns.apiErrorToValidationErrorsList(listApiErrors));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * Set the dependencies needed for the registration
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function setContext(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    context.usersStorage = usersStorage;
    context.storageLayer = storageLayer;
    context.servicesSettings = servicesSettings;
    context.hostname = serverSettings.hostname;
    context.logger = logging.getLogger('methods/system');
    next();
  }

};
module.exports.injectDependencies = true;