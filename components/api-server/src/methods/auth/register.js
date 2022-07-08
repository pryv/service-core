/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const commonFns = require('./../helpers/commonFunctions');
const errors = require('errors').factory;
const { ErrorMessages, ErrorIds } = require('errors');
const methodsSchema = require('api-server/src/schema/authMethods');
const Registration = require('business/src/auth/registration');
const { getPlatform } = require('platform');
const { getConfigUnsafe } = require('@pryv/boiler');
const { setAuditAccessId, AuditAccessIds } = require('audit/src/MethodContextUtils');
const { getLogger, getConfig } = require('@pryv/boiler');
const { getStorageLayer } = require('storage');
const userIndex = require('business/src/users/UserLocalIndex');

import type { MethodContext } from 'business';
import type Result  from '../Result';
import type { ApiCallback }  from '../API';

/**
 * Auth API methods implementations.
 *
 * @param api
 */
module.exports = async function (api) {
  const config = await getConfig();
  const logging = await getLogger('register');
  const storageLayer = await getStorageLayer();
  const servicesSettings = config.get('services')
  const isDnsLess = config.get('dnsLess:isActive');
  await userIndex.init();

  // REGISTER
  const registration: Registration = new Registration(logging, storageLayer, servicesSettings);
  await registration.init();
  const platform = await getPlatform(); 

  function skip(context, params, result, next) { next(); }
  function ifDnsLess(ifTrue, ifFalse) {
    if (isDnsLess) {
      return ifTrue || skip;
    } 
    return ifFalse || skip;
  }

  api.register('auth.register',
    setAuditAccessId(AuditAccessIds.PUBLIC),
    // data validation methods        
    commonFns.getParamsValidation(methodsSchema.register.params),
    registration.prepareUserData,
    ifDnsLess(skip, registration.createUserStep1_ValidateUserOnPlatform.bind(registration)),
    //user registration methods
    ifDnsLess(skip, registration.deletePartiallySavedUserIfAny.bind(registration)),
    registration.createUser.bind(registration),
    ifDnsLess(skip, registration.createUserStep2_CreateUserOnPlatform.bind(registration)),
    registration.buildResponse.bind(registration),
    registration.sendWelcomeMail.bind(registration),
  );
  
  // Username check
  /**
   * Seem to be use only in dnsLess..  
   */
  api.register('auth.usernameCheck',
    setAuditAccessId(AuditAccessIds.PUBLIC),
    commonFns.getParamsValidation(methodsSchema.usernameCheck.params),
    ifDnsLess(checkUniqueField, checkUsername)
  );


  //
  /**
   * DNSLess Only
   */
  api.register('auth.emailCheck',
    setAuditAccessId(AuditAccessIds.PUBLIC),
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

    // username
    if (field == 'username') {
      if (await userIndex.existsUsername(params[field]))
      return next(errors.itemAlreadyExists( "user", {'username': params[field]}));
    }

    // other unique fields
    const value = await platform.getUserUniqueField(field, params[field]); 
    if (value != null) {
      return next(errors.itemAlreadyExists("user", {[field]: params[field]}));
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
      result.reserved = await platform.isUsernameReserved(params.username);
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

};