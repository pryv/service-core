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
const async = require('async');
const cuid = require('cuid');
const bluebird = require('bluebird');
const errors = require('components/errors').factory;
const errorHandling = require('components/errors').errorHandling;
const commonFns = require('components/api-server/src/methods/helpers/commonFunctions');
const mailing = require('components/api-server/src/methods/helpers/mailing');
const ServiceRegister = require('./service_register');
const methodsSchema = require('components/api-server/src/schema/authMethods');
var string = require('components/api-server/src/schema/helpers').string;
const UserInfoSerializer = require('components/business/src/user/user_info_serializer');

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

const { getConfig, Config } = require('components/api-server/config/Config');
const config: Config = getConfig();

/**
 * Create (register) a new user
 */
class Registration {
  logger;
  storageLayer; // used for initUser
  servicesSettings; // settigns to get the email to send user welcome email
  serviceRegisterConn; // service-register connection
  hostname; // hostname that will be saved in service-register as a 'core' where user is registered
  accountStreamsSettings;

  constructor (logging, storageLayer, servicesSettings, serverSettings) { 

    this.logger = logging.getLogger('methods/system');
    this.storageLayer = storageLayer;
    this.servicesSettings = servicesSettings;

    this.serviceRegisterConn = new ServiceRegister(servicesSettings.register, logging.getLogger('service-register'));
    this.hostname = serverSettings.hostname;
    this.accountStreamsSettings = config.get('systemStreams:account');
    
    // bind this object to the functions that need it
    this.createUser = this.createUser.bind(this);
    this.createUserInServiceRegister = this.createUserInServiceRegister.bind(this);
    this.sendWelcomeMail = this.sendWelcomeMail.bind(this);
    this.validateThatUserDoesNotExistInLocalDb = this.validateThatUserDoesNotExistInLocalDb.bind(this);
    this.validateUserInServiceRegister = this.validateUserInServiceRegister.bind(this);
    this.initUser = this.initUser.bind(this);
    this.createPoolUser = this.createPoolUser.bind(this);
    this.loadCustomValidationSettings = this.loadCustomValidationSettings.bind(this);

    this.POOL_USERNAME_PREFIX = 'pool@';
    this.TEMP_USERNAME_PREFIX = 'temp@';
    // TODO IEVA - is it needed
    this.POOL_REGEX = new RegExp('^' + this.POOL_USERNAME_PREFIX);
  }

  /**
   * Save user in service-register
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async createUserInServiceRegister (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      let userInfoSerializer = new UserInfoSerializer();
      // get streams ids from the config that should be retrieved
      const userStreamsIds = userInfoSerializer.getIndexedAccountStreams();
      const uniqueStreamsIds = userInfoSerializer.getUniqueAccountStreamsIds();

      // form data that should be sent to service-register
      // some default values and indexed/uinique fields of the system
      let saveToServiceRegister = {
        user: {
          id: context.user.id
        },
        host: context.user.host
      };
      Object.keys(userStreamsIds).forEach(streamId => {
        saveToServiceRegister.user[streamId] = context.user[streamId];
      });
      saveToServiceRegister.unique = [];
      uniqueStreamsIds.forEach(streamId => {
        saveToServiceRegister.unique.push(streamId);
      });

      const response = await this.serviceRegisterConn.createUser(saveToServiceRegister, params);
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
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async createUser (context: MethodContext, params: mixed, result, next: ApiCallback) {
    if (context.skip === true) { return next() };

    // if it is testing user, skip registration process
    if (params.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user = _.defaults({ id: result.id }, params);
      return next();
    }

    try {
      // Consume a pool user if available or use default creation
      // const user = await Registration.createUserOrConsumePool(params, context, params);
      /* TODO IEVA - do not understand what this part does here
       const updatedUser = await bluebird.fromCallback(
         (cb) => context.usersStorage.findOneAndUpdate({ username: { $regex: context.POOL_REGEX } }, params, cb));      
       if (updatedUser === null) {
         throw Error("Bad, really bad");//TODO IEVA
       }*/
      context.user = {
        username: params.username
      }
      const user = await this.storageLayer.events.createUser(params);
      context.user = { ...context.user, ...user}
      context.user.host = { name: this.hostname };

      // form the result for system call or full registration call
      if (context.calledMethodId === 'system.createUser') {
        result.id = context.user.id;
      } else {
        result.username = context.user.username;
      }
      next();
    } catch (err) {
      console.log(err,'err');
     // TODO IEVA
      // const tempUser = _.clone(userInfo);
      // tempUser.username = context.TEMP_USERNAME_PREFIX + cuid();
      return next(this.handleUniqnessErrors(err));
    }
  }

  createPoolUser (context, params, result, next) {
    const uniqueId = cuid();
    params.username = this.POOL_USERNAME_PREFIX + uniqueId;
    params.passwordHash = 'changeMe';
    params.language = 'en';
    params.email = this.POOL_USERNAME_PREFIX + uniqueId + '@email';
    next();

    /*
    usersStorage.insertOne(poolUser, (err, tempUser) => {
      if (err != null) return next(this.handleUniqnessErrors(err));

      return this.initUser(tempUser, username, (err, finalUser) => {
        if (err != null) return next(this.handleUniqnessErrors(err));
        result.id = finalUser.id;
        context.user = finalUser;
        return next();
      });
    });*/
  }

  /**
   * 
   * @param {*} tempUser 
   * @param {*} username 
   * @param {*} callback 
   */
  async initUser (tempUser, username, callback) {
    const repositories = [
      this.storageLayer.accesses,
      this.storageLayer.events,
      this.storageLayer.followedSlices,
      this.storageLayer.profile,
      this.storageLayer.streams];
    // Init user's repositories (create collections and indexes)
    async.eachSeries(repositories, (repository, stepDone) => {
      repository.initCollection(tempUser, stepDone);
    }, async (err) => {
      if (err != null) return callback(err);
      // Rename temp username
      try {
        //TODO IEVA - validate
        const finalUser = await bluebird.fromCallback(
          (cb) => this.storageLayer.events.updateOne({},
            { $and: [{ streamIds: 'username' }, { content: { $eq: tempUser.username } }] },
            { content: username }, cb));
        return callback(null, finalUser);
      } catch (e) {
        return callback(e);
      }
    });
  }
  /**
   * Form errors for api response
   * @param {*} err 
   * @param {*} params 
   */
  static handleUniquenessErrors (err, message) {
    // Duplicate errors
    // I check for these errors in the validation so they are only used for 
    // deprecated systems.createUser path
    let listApiErrors = [];
    if (typeof err.isDuplicateIndex === 'function') {
      listApiErrors.push(errors.existingField(err.duplicateIndex()));
    }
    // TODO IEVA - error for the other keys
    if (listApiErrors.length > 0) {
      return commonFns.apiErrorToValidationErrorsList(listApiErrors);
    }
    // Any other error
    if (!message) {
      message = 'Unexpected error while saving user.';
    }
    return errors.unexpectedError(err, message);
  }
  /**
 * Form errors for api response
 * @param {*} err 
 * @param {*} params 
 */
  static handleUniqnessErrorsInSingleErrorFormat (err, message) {
    // Uniquenss errors
    if (typeof err.isDuplicateIndex === 'function') {
      return errors.existingField(err.duplicateIndex());
    }
    // Any other error
    if (!message) {
      message = 'Unexpected error while saving the user.';
    }
    return errors.unexpectedError(err, message);
  }
  /**
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  sendWelcomeMail (context: MethodContext, params: mixed, result, next: ApiCallback) {
    const emailSettings = this.servicesSettings.email;

    // Skip this step if welcome mail is deactivated
    const isMailActivated = emailSettings.enabled;
    if (isMailActivated === false ||
      (isMailActivated != null && isMailActivated.welcome === false)) {
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

    mailing.sendmail(emailSettings, emailSettings.welcomeTemplate, recipient,
      substitutions, context.user.language, (err) => {
        // Don't fail creation process itself (mail isn't critical), just log error
        if (err) {
          errorHandling.logError(err, null, this.logger);
        }

        next();
      });
  }

  /**
   * Check in service-register if email already exists
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async validateThatUserDoesNotExistInLocalDb (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-core
      const existingUser = await bluebird.fromCallback(
        (cb) => this.storageLayer.events.findOne({},
          {
            $or: [{ $and: [{ streamIds: 'username' }, { content: params.username }] },
            { $and: [{ streamIds: 'email' }, { content: params.email }] }]
          },
          null, cb)
      );

      // if email was already saved, it means that there were an error 
      // saving in service register (above there is a check that email does not exist in
      // service register)
      if (existingUser?.content) { // TODO IEVA is this check ok

        // skip all steps exept registrattion in service-register and welcome email
        context.skip = true;

        //append context with the same values that would be saved by createUser function
        // TODO IEVA maybe worth it doing more dynamically
        context.user = await this.storageLayer.events.getUserInfo({
          user: { id: context.user.id },
          getAll: true
        });

        // set result as current username
        result.username = context.user.username;
        this.logger.error(`User with id ${existingUser.id} tried to register and application is skipping the user creation on service-core db`);
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
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
  async validateUserInServiceRegister (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      let uniqueFields = {};
      for (const [key, value] of Object.entries(this.accountStreamsSettings)) {
        // if key is set as required - add required validation
        if (value.isUnique && value.isUnique === true) {
          uniqueFields[key] = params[key];
        }
      }

      // do the validation and reservation in service-register
      const response = await this.serviceRegisterConn.validateUser(params.username, params.invitationToken, uniqueFields, this.hostname);

      if (response?.errors && response.errors.length > 0) {
        const sentValues: { string: string } = _.merge({
          username: params.username,
          invitationToken: params.invitationToken,
        }, uniqueFields);
        const uniquenessErrors = {};
        const unexpectedErrors = [];
        const impossibleErrors = [];
        // 1. convert list of error ids to the list of api errors
        response.errors.forEach(err => {
          // lets check if error thrown by service-register is already defined in errors factory
          if (typeof errors[err] === 'function'){
            console.log('HOW AM I HERE', err);
            impossibleErrors.push(errors[err]());
          } else if (err.startsWith('Existing_')) {
            const fieldName = err.replace('Existing_', '');
            uniquenessErrors[fieldName] = sentValues[fieldName];
          } else {
            unexpectedErrors.pop(errors.unexpectedError(errors[err]));
          }
        });

        // handle unexpected & impossible

        // 2. convert api errors to validation errors
        return next(errors.itemAlreadyExists('user', uniquenessErrors));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  /**
   * Do minimal manipulation with data like username convertion to lowercase
   * TODO IEVA -email to lowercase - why?
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async prepareUserDataForSaving (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    params.username = params.username.toLowerCase();
    params.email = params.email.toLowerCase();

    // change parameter name
    if (params.languageCode){
      params.language = params.languageCode;
    }
    delete params.languageCode;

    next();
  }

  /**
   * Append validation settings to validation schema and save new object to the context
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  loadCustomValidationSettings (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    let validationSchema = Object.assign({}, methodsSchema.register.params);

    // iterate account stream settings and APPEND validation with relevant properties
    // etc additional required fields or regex validation
    for (const [field, value] of Object.entries(this.accountStreamsSettings)) {
      // if field is set as required - add required validation
      if (value.isRequiredInValidation && value.isRequiredInValidation == true && !methodsSchema.register.params.required.includes(field)) {
        validationSchema.required.push(field)
        //TODO IEVA - the error message of required property by z-schema is still a hell
      }

      // if field has type valiadtion - add regex type rule
      // etc : '^(series:)?[a-z0-9-]+/[a-z0-9-]+$'
      if (value.regexValidation && !methodsSchema.register.params.properties.hasOwnProperty(field)) {
        validationSchema.properties[field] = string({ pattern: value.regexValidation });
        
        // if there is an error message and code specified, set those too
        if (value.regexError && !methodsSchema.register.params.messages.hasOwnProperty(field)) {
          validationSchema.messages[field] = { 'PATTERN': value.regexError };
        }
      }
    }

    commonFns.getParamsValidation(validationSchema)(context, params, result, next);
  }
};

module.exports = Registration;
