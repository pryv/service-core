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
const errors = require('components/errors').factory;
const mailing = require('components/api-server/src/methods/helpers/mailing');
const ServiceRegister = require('./service_register');

type GenericCallback<T> = (err?: ?Error, res: ?T) => mixed;
type Callback = GenericCallback<mixed>;
import type { MethodContext } from 'components/model';
import type { ApiCallback } from 'components/api-server/src/API';

export type UserInformation = {
  id?: string,

  username: string,
  email: string,
  language: string,

  password: string,
  passwordHash: string,

  invitationToken: string,
  registeredTimestamp?: number,

  server?: string,
}

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
      const serviceRegisterConn = new ServiceRegister(context.servicesSettings.register);
      // check email in service-register
      const user = {
        "username": context.user.username,
        "email": context.user.email,
        "invitationtoken": context.user.invitationtoken,
        // TODO IEVA - hostname should be here somehow
        "host": {"name": context.hostname}
      };
      const response = await serviceRegisterConn.createUser(user);

      if (response.username) {
        result.server = response.server;
        // TODO - do I need api endpoint?
        result.apiEndpoint = response.apiEndpoint;
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
        result.username = user.username;
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
          errorHandling.logError(err, null, logger);
        }

        next();
      });
  }
}
module.exports = User;