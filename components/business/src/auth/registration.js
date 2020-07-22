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
const commonFns = require('components/api-server/src/methods/helpers/commonFunctions');
const mailing = require('components/api-server/src/methods/helpers/mailing');
const ServiceRegister = require('./service_register');
const encryption = require('components/utils').encryption;

import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

/**
 * Create (register) a new user
 * 
 * @param host the hosting for this user
 * @param user the user data, a json object containing: username, password hash, language and email
 * @param callback function(error,result), result being a json object containing new user data
 */
class User {

  applyDefaultsForCreation(context: MethodContext, params: mixed, result, next: ApiCallback) {
    params.storageUsed = {
      dbDocuments: 0,
      attachedFiles: 0
    };
    next();
  }

  /**
   * Save user in service-register
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async createUserInServiceRegister(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // if the call comes from system user creation, add service register connection
      if(!context.serviceRegisterConn){
        context.serviceRegisterConn = new ServiceRegister(context.servicesSettings.register, context.logger);
      }
      
      // check email in service-register
      const user = {
        "username": context.user.username,
        "email": context.user.email,
        "invitationtoken": context.user.invitationtoken,
        "referer": (context.user.referer) ? context.user.referer: null,
        "id": context.user.id,
        "appId": context.user.appId,
        "language": context.user.language,
        "host": {"name": context.hostname}
      };
      const response = await context.serviceRegisterConn.createUser(user);

      // take only server name
      if (response.username) {
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
  createUser(context: MethodContext, params: mixed, result, next: ApiCallback) {
    if(context.skip === true){ return next() };
    /**
     * 
     * @param {*} userInfo 
     * @param {*} callback 
     */
    function createUserOrConsumePool(userInfo, callback) {
      // Try to consume a user from pool
      context.usersStorage.findOneAndUpdate({ username: { $regex: context.POOL_REGEX } }, userInfo,
        (err, updatedUser) => {
          // Fallback to default user creation in case of error or empty pool
          if (err != null || updatedUser == null) {

            // First create a temp user
            const tempUser = _.clone(userInfo);
            tempUser.username = context.TEMP_USERNAME_PREFIX + cuid();
            context.usersStorage.insertOne(tempUser, (err, newUser) => {
              if (err != null) return callback(err);
              // Convert temp to final user
              return initUser(newUser, userInfo.username, callback, context.storageLayer);
            });
          }
          else {
            return callback(null, updatedUser);
          }
        }
      );
    }

    /**
     * 
     * @param {*} tempUser 
     * @param {*} username 
     * @param {*} callback 
     */
    function initUser(tempUser, username, callback, storageLayer) {
      const repositories = [storageLayer.accesses, storageLayer.events,
      storageLayer.followedSlices, storageLayer.profile, storageLayer.streams];
      // Init user's repositories (create collections and indexes)
      async.eachSeries(repositories, (repository, stepDone) => {
        repository.initCollection(tempUser, stepDone);
      }, (err) => {
        if (err != null) return callback(err);
        // Rename temp username
        context.usersStorage.updateOne({ username: tempUser.username }, { username: username },
          (err, finalUser) => {
            if (err != null) return callback(err);
            return callback(null, finalUser);
          });
      });
    }

    if (params.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user = _.defaults({ id: result.id }, params);
      next();
    } else {
      // Consume a pool user if available or use default creation

      createUserOrConsumePool(params, (err, user) => {
        if (err != null) return next(User.handleCreationErrors(err, params));

        if(context.systemCall === true){
          result.id = user.id;
        }else{
          result.username = user.username;
        }
        context.user = user;
        next();
      });
    }
  }

  /**
   * Form errors for api response
   * Note - if we remove system user, this could deprecate
   * @param {*} err 
   * @param {*} params 
   */
  static handleCreationErrors(err, params) {
    // Duplicate errors
    // I check for these errors in the validation so they are only used for 
    // deprecated systems.createUser path
    if (err.isDuplicateIndex('email')) {
      return errors.itemAlreadyExists('user', { email: params.email }, err);
    }
    if (err.isDuplicateIndex('username')) {
      return errors.itemAlreadyExists('user', { username: params.username }, err);
    }
    // Any other error
    return errors.unexpectedError(err, 'Unexpected error while saving user.');
  }


  /**
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  sendWelcomeMail(context: MethodContext, params: mixed, result, next: ApiCallback) {
    const emailSettings = context.servicesSettings.email;

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
          errorHandling.logError(err, null, context.logger);
        }

        next();
      });
  }

  /**
   * Check in service-register if invitation token is valid
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async setDefaultValues(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
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
  async validateThatUserDoesNotExistInLocalDb(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-core
      const existingUser = await bluebird.fromCallback(
        (cb) => context.usersStorage.findOne({ $or: [ {email: params.email}, {username: params.username} ] }, null, cb)
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
  async validateUserInServiceRegister(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const response = await context.serviceRegisterConn.validateUser(params.email, params.username, params.invitationtoken);

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
  async prepareUserDataForSaving(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    params.username = params.username.toLowerCase();
    params.email = params.email.toLowerCase();
    
    // change parameter name
    params.language = params.languageCode;
    delete params.languageCode;
    
    // Construct the request for core, including the password. 
    params.passwordHash = await encryption.hash(params.password);
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
  async reserveUserInServiceRegister(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(context.skip === true){ return next()};
    try {
      const canRegister: Boolean = await context.serviceRegisterConn.reserveUser(params.username, context.hostname);

      if (canRegister == false) {
        return next(commonFns.apiErrorToValidationErrorsList([errors.DuplicatedUserRegistration()]));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }
}
module.exports = User;