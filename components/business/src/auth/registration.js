/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/**
 * Extension of database.js dedicated to user management
 */
const _ = require('lodash');
const cuid = require('cuid');
const errors = require('components/errors').factory;
const { errorHandling } = require('components/errors');
const commonFns = require('components/api-server/src/methods/helpers/commonFunctions');
const mailing = require('components/api-server/src/methods/helpers/mailing');
const ServiceRegister = require('./service_register');
const methodsSchema = require('components/api-server/src/schema/authMethods');
var string = require('components/api-server/src/schema/helpers').string;
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');
const UserRepository = require('components/business/src/users/repository');
const User = require('components/business/src/users/User');

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

/**
 * Create (register) a new user
 */
class Registration {
  logger: any;
  storageLayer: any; // used for initUser
  defaultStreamsSerializer: SystemStreamsSerializer = new SystemStreamsSerializer();
  serviceRegisterConn: ServiceRegister; // service-register connection
  userRepository: UserRepository; 
  hostname: string; // hostname that will be saved in service-register as a 'core' where user is registered
  accountStreamsSettings: any = this.defaultStreamsSerializer.getFlatAccountStreamSettings();
  servicesSettings: any; // settigns to get the email to send user welcome email

  constructor(logging, storageLayer, servicesSettings, serverSettings) {
    this.logger = logging.getLogger('business/registration');
    this.storageLayer = storageLayer;
    this.servicesSettings = servicesSettings;

    this.serviceRegisterConn = new ServiceRegister(
      servicesSettings.register,
      logging.getLogger('service-register')
    );
    this.userRepository = new UserRepository(this.storageLayer.events);
    this.hostname = serverSettings.hostname;
    this.POOL_USERNAME_PREFIX = 'pool@';
    this.TEMP_USERNAME_PREFIX = 'temp@';
    this.POOL_REGEX = new RegExp('^' + this.POOL_USERNAME_PREFIX);
  }

  /**
   * Append validation settings to validation schema and save new object to the context
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  loadCustomValidationSettings(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    let validationSchema = Object.assign({}, methodsSchema.register.params);

    // iterate account stream settings and APPEND validation with relevant properties
    // etc additional required fields or regex validation
    for (const [field, value] of Object.entries(this.accountStreamsSettings)) {
      // if field is set as required - add required validation
      if (
        value.isRequiredInValidation &&
        value.isRequiredInValidation == true &&
        !methodsSchema.register.params.required.includes(field)
      ) {
        validationSchema.required.push(field);
        //TODO IEVA - the error message of required property by z-schema is still a hell
      }

      // if field has type valiadtion - add regex type rule
      // etc : '^(series:)?[a-z0-9-]+/[a-z0-9-]+$'
      if (
        value.regexValidation &&
        !methodsSchema.register.params.properties.hasOwnProperty(field)
      ) {
        validationSchema.properties[field] = string({
          pattern: value.regexValidation
        });

        // if there is an error message and code specified, set those too
        if (
          value.regexError &&
          !methodsSchema.register.params.messages.hasOwnProperty(field)
        ) {
          validationSchema.messages[field] = { PATTERN: value.regexError };
        }
      }
    }

    commonFns.getParamsValidation(validationSchema)(
      context,
      params,
      result,
      next
    );
  }
  
  /**
   * Do minimal manipulation with data like username convertion to lowercase
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async prepareUserData (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (params.username && typeof params.username === 'string') {
      params.username = params.username.toLowerCase();
    }
    if (params.email && typeof params.email === 'string') {
      params.email = params.email.toLowerCase();
    }
    next();
  }

  /**
   * Validation and reservation in service-register
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  async validateUserInServiceRegister(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      let uniqueFields = {};
      for (const [key, value] of Object.entries(this.accountStreamsSettings)) {
        // if key is set as required - add required validation
        if (value.isUnique && value.isUnique === true) {
          uniqueFields[key] = params[key];
        }
      }

      // do the validation and reservation in service-register
      await this.serviceRegisterConn.validateUser(
        params.username,
        params.invitationToken,
        uniqueFields,
        this.hostname
      );
    } catch (error) {
      return next(error);
    }
    next();
  }

  async prepareUserDataForSaving(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    // change parameter name
    if (params.languageCode) {
      params.language = params.languageCode;
    }
    delete params.languageCode;

    next();
  }

  /**
   * Check in service-register if email already exists
   *
   * !!! Not solved scenario if main user info was saved in service-register, but
   * additional unique fields were not TODO IEVA
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  async validateThatUserDoesNotExistInLocalDb(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      // TODO IEVA -verify this logic with Ilia, because there
      // could be additional unique fields
      const existingUser = await this.userRepository.checkUserFieldsUniqueness(params);
      // if any of unique fields were already saved, it means that there were an error
      // saving in service register (above there is a check that email does not exist in
      // service register)
      if (existingUser?.content) {
        // skip all steps exept registrattion in service-register and welcome email
        context.skip = true;

        //append context with the same values that would be saved by createUser function
        const userObj: User = await this.userRepository.getById(existingUser.userId, true);
        context.user = userObj.getAccount();

        // set result as current username
        result.username = context.user.username;
        this.logger.error(
          `User with id ${
            existingUser.id
          } tried to register and application is skipping the user creation on service-core db`
        );
      }
    } catch (error) {
      console.log(error, 'error');
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * Save user in service-register
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  async createUserInServiceRegister(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      const defaultStreamsSerializer = this.defaultStreamsSerializer;
      // get streams ids from the config that should be retrieved
      const userStreamsIds = defaultStreamsSerializer.getIndexedAccountStreams();
      const uniqueStreamsIds = defaultStreamsSerializer.getUniqueAccountStreamsIds();

      // form data that should be sent to service-register
      // some default values and indexed/uinique fields of the system
      const userData = {
        user: {
          id: context.user.id
        },
        host: context.user.host
      };
      Object.keys(userStreamsIds).forEach(streamId => {
        if (context.user[streamId] != null) userData.user[streamId] = context.user[streamId];
      });
      userData.unique = [];
      uniqueStreamsIds.forEach(streamId => {
        userData.unique.push(streamId);
      });

      const response = await this.serviceRegisterConn.createUser(userData);
      // take only server name
      if (response.server) {
        result.server = response.server;
        return next();
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * Save user to the database
   * Pool user is not consumed anymore
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async createUser(
    context: MethodContext,
    params: mixed,
    result,
    next: ApiCallback
  ) {
    if (context.skip === true) {
      return next();
    }

    // if it is testing user, skip registration process
    if (params.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user = _.defaults({ id: result.id }, params);
      return next();
    }

    try {
      context.user = {
        username: params.username
      };
      const user = await this.userRepository.insertOne(
        params,
        this.storageLayer.sessions,
        this.storageLayer.accesses);
      context.user = { ...context.user, ...user };
      context.user.host = { name: this.hostname };

      // form the result for system call or full registration call
      if (context.calledMethodId === 'system.createUser') {
        result.id = context.user.id;
      } else {
        result.username = context.user.username;
      }
      next();
    } catch (err) {
      return next(Registration.handleUniquenessErrors(err, null, params));
    }
  }

  /**
   *
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  sendWelcomeMail(
    context: MethodContext,
    params: mixed,
    result,
    next: ApiCallback
  ) {
    const emailSettings = this.servicesSettings.email;

    // Skip this step if welcome mail is deactivated
    const isMailActivated = emailSettings.enabled;
    if (
      isMailActivated === false ||
      (isMailActivated != null && isMailActivated.welcome === false)
    ) {
      return next();
    }

    const recipient = {
      email: context.user.email,
      name: context.user.username,
      type: 'to'
    };

    const substitutions = {
      USERNAME: context.user.username,
      EMAIL: context.user.email
    };

    mailing.sendmail(
      emailSettings,
      emailSettings.welcomeTemplate,
      recipient,
      substitutions,
      context.user.language,
      err => {
        // Don't fail creation process itself (mail isn't critical), just log error
        if (err) {
          errorHandling.logError(err, null, this.logger);
        }
        next();
      }
    );
  }

  /**
   * DEPRECATED
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  createPoolUser(context, params, result, next) {
    const uniqueId = cuid();
    params.username = this.POOL_USERNAME_PREFIX + uniqueId;
    params.passwordHash = 'changeMe';
    params.language = 'en';
    params.email = this.POOL_USERNAME_PREFIX + uniqueId + '@email';
    next();
  }

  /**
   * Form errors for api response
   * @param {*} err
   * @param {*} params
   */
  static handleUniquenessErrors (err, message, params) {
    // Duplicate errors
    let uniquenessErrors = {};
    if (typeof err.isDuplicateIndex === 'function') {
      uniquenessErrors[err.duplicateIndex()] = params[err.duplicateIndex()];
    }

    if (Object.keys(uniquenessErrors).length > 0) {
      return errors.itemAlreadyExists('user', uniquenessErrors);
    }
    // Any other error
    if (!message) {
      message = 'Unexpected error while saving user.';
    }
    return errors.unexpectedError(err, message);
  }
}

module.exports = Registration;
