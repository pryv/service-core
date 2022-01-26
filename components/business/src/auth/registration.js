/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const cuid = require('cuid');
const errors = require('errors').factory;
const { errorHandling } = require('errors');
const mailing = require('api-server/src/methods/helpers/mailing');

const { getPlatform } = require('platform');

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getUsersRepository, User } = require('business/src/users');
const ErrorIds = require('errors').ErrorIds;

const { getLogger } = require('@pryv/boiler');
const { ApiEndpoint } = require('utils');

import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';

/**
 * Create (register) a new user
 */
class Registration {
  logger: any;
  storageLayer: any;
  accountStreamsSettings: any = SystemStreamsSerializer.getAccountMap();
  servicesSettings: any; // settigns to get the email to send user welcome email
  platform: Platform;

  constructor(logging, storageLayer, servicesSettings) {
    this.logger = getLogger('business:registration');
    this.storageLayer = storageLayer;
    this.servicesSettings = servicesSettings;
  }

  async init() {
    if (this.platform == null) {
      this.platform = await getPlatform();
    }
    return this;
  }

  /**
   * Do minimal manipulation with data like username conversion to lowercase
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async prepareUserData(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    context.newUser = new User(params);
    context.user = { 
      id: context.newUser.id,
      username: context.newUser.username
    };
    next();
  }

  /**
   * Validation and reservation in service-register
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  async createUserStep1_ValidateUserOnPlatform(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      const uniqueFields = {username: context.newUser.username};
      for (const [streamIdWithPrefix, streamSettings] of Object.entries(this.accountStreamsSettings)) {
        // if key is set as required - add required validation
        if (streamSettings?.isUnique) {
          const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(streamIdWithPrefix)
          uniqueFields[streamIdWithoutPrefix] = context.newUser[streamIdWithoutPrefix];
        }
      }
      
      // do the validation and reservation in service-register
      await this.platform.createUserStep1_ValidateUser(
        context.newUser.username,
        context.newUser.invitationToken,
        uniqueFields,
        context.host
      );
    } catch (error) {
      return next(error);
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
  async deletePartiallySavedUserIfAny(
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      // assert that we have obtained a lock on register, so any conflicting fields here 
      // would be failed registration attempts that partially saved user data.
      const usersRepository = await getUsersRepository();

      const matchingUserId = await usersRepository.getUserIdForUsername(context.newUser.username);

      if (matchingUserId != null) {
        await usersRepository.deleteOne(matchingUserId);

          this.logger.error(
            `User with id ${
              matchingUserId
            } was deleted because it was not found on service-register but uniqueness conflicted on service-core`
          );
      };

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
  async createUser(
    context: MethodContext,
    params: mixed,
    result,
    next: ApiCallback
  ) {
    // if it is testing user, skip registration process
    if (context.newUser.username === 'recla') {
      result.id = 'dummy-test-user';
      context.newUser.id = result.id;
      context.user.username = context.newUser.username;
      return next();
    }

    try {
      const usersRepository = await getUsersRepository();
      await usersRepository.insertOne(context.newUser, true);
    } catch (err) {
      return next(err);
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
  async createUserStep2_CreateUserOnPlatform (
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    try {
      // get streams ids from the config that should be retrieved
      const userStreamsIds = SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutPrefix();

      // build data that should be sent to service-register
      // some default values and indexed/uinique fields of the system
      const userData = {
        user: {
          id: context.newUser.id
        },
        host: { name: context.host },
        unique: ['username', ...SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix()],
        user: {username: context.newUser.username}
      };
      userStreamsIds.forEach(streamId => {
        if (context.newUser[streamId] != null) userData.user[streamId] = context.newUser[streamId];
      });
      await this.platform.createUserStep2_CreateUser(userData);
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }
  
  /**
   * Build response for user registration
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async buildResponse (
    context: MethodContext,
    params: mixed,
    result: Result,
    next: ApiCallback
  ) {
    result.username =  context.newUser.username;
    result.apiEndpoint = ApiEndpoint.build(context.newUser.username, context.newUser.token);
    next();
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
    result: Result,
    next: ApiCallback
  ) {
    
    const emailSettings = this.servicesSettings.email;
   
    // Skip this step if welcome mail is deactivated
    const emailActivation = emailSettings.enabled;
    if (emailActivation?.welcome === false) {
      return next();
    }

    const recipient = {
      email: context.newUser.email,
      name: context.newUser.username,
      type: 'to'
    };

    const substitutions = {
      USERNAME: context.newUser.username,
      EMAIL: context.newUser.email
    };

    mailing.sendmail(
      emailSettings,
      emailSettings.welcomeTemplate,
      recipient,
      substitutions,
      context.newUser.language,
      err => {
        // Don't fail creation process itself (mail isn't critical), just log error
        if (err) {
          errorHandling.logError(err, null, this.logger);
        }
      }
    );
    next();
  }
}

module.exports = Registration;
