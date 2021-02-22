/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const commonFns = require('./../helpers/commonFunctions');
const errors = require('errors').factory;
const methodsSchema = require('api-server/src/schema/authMethods');
const { getServiceRegisterConn } = require('business/src/auth/service_register');
const Registration = require('business/src/auth/registration');


const { getConfigUnsafe } = require('@pryv/boiler');

import type { MethodContext } from 'model';
import type Result  from '../Result';
import type { ApiCallback }  from '../API';


/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function (api, logging, storageLayer, servicesSettings) {

  const isDnsLess = getConfigUnsafe().get('dnsLess:isActive');

  // REGISTER
  const registration: Registration = new Registration(logging, storageLayer, servicesSettings);
  const serviceRegisterConn: ServiceRegister = getServiceRegisterConn();

  function skip(context, params, result, next) { next(); }
  function ifDnsLess(ifTrue, ifFalse) {
    if (isDnsLess) {
      return ifTrue || skip;
    } 
    return ifFalse || skip;
  }

  api.register('auth.register',
    // data validation methods        
    commonFns.getParamsValidation(methodsSchema.register.params),
    registration.prepareUserData,
    ifDnsLess(skip, registration.validateUserInServiceRegister.bind(registration)),
    //user registration methods
    ifDnsLess(skip, registration.deletePartiallySavedUserIfAny.bind(registration)),
    registration.createUser.bind(registration),
    registration.createUserInServiceRegister.bind(registration),
    registration.buildResponse.bind(registration),
    registration.sendWelcomeMail.bind(registration),
  );
  
  // Username check
  /**
   * Seem to be use only in dnsLess..  
   */
  api.register('auth.usernameCheck',
    commonFns.getParamsValidation(methodsSchema.usernameCheck.params),
    ifDnsLess(checkUniqueField, checkUsername)
  );


  //
  /**
   * DNSLess Only
   */
  api.register('auth.emailCheck',
    commonFns.getParamsValidation(methodsSchema.emailCheck.params),
    checkUniqueField
  );

  /**
   * Check in service-register if user id is reserved
   * !ONLY DnsLess = true
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async function checkUniqueField(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    result.reserved = false;
    // the check for the required field is done by the schema
    const field = Object.keys(params)[0];
    try {
      const existingUsers = await usersRepository.findExistingUniqueFields({ [field]: params[field]});
      if (existingUsers.length > 0) {
        return next(errors.itemAlreadyExists('user', { [field]: params[field] }));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }



  /**
   * Check in service-register if user id is reserved
   * !ONLY DnsLess = false
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
        return next(errors.itemAlreadyExists('user', { username: params.username }));
      }else if (response.reserved != null) {
        result.reserved = false;
      }
      
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

};