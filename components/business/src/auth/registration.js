/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const cuid = require('cuid');
const errors = require('errors').factory;
const { errorHandling } = require('errors');
const mailing = require('api-server/src/methods/helpers/mailing');
const { getServiceRegisterConn } = require('./service_register');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getUsersRepository, User } = require('business/src/users');
const ErrorIds = require('errors').ErrorIds;

const { getLogger } = require('@pryv/boiler');

import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';

/**
 * Create (register) a new user
 */
class Registration {
  logger: any;
  storageLayer: any;
  serviceRegisterConn: ServiceRegister;
  accountStreamsSettings: any = SystemStreamsSerializer.getAccountMap();
  servicesSettings: any; // settigns to get the email to send user welcome email

  constructor(logging, storageLayer, servicesSettings) {
    this.logger = getLogger('business:registration');
    this.storageLayer = storageLayer;
    this.servicesSettings = servicesSettings;

    this.serviceRegisterConn = getServiceRegisterConn();
  }

  /**
   * Do minimal manipulation with data like username conversion to lowercase
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  async prepareUserData(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    context.user = new User(params);
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
      const uniqueFields = {};
      for (const [streamIdWithPrefix, streamSettings] of Object.entries(this.accountStreamsSettings)) {
        // if key is set as required - add required validation
        if (streamSettings?.isUnique) {
          const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(streamIdWithPrefix)
          uniqueFields[streamIdWithoutPrefix] = context.user[streamIdWithoutPrefix];
        }
      }
      
      // do the validation and reservation in service-register
      await this.serviceRegisterConn.validateUser(
        context.user.username,
        context.user.invitationToken,
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
      const existingUsers = await usersRepository.findExistingUniqueFields(context.user.getUniqueFields());

      // if any of unique fields were already saved, it means that there was an error
      // saving in service register (before this step there is a check that unique fields 
      // don't exist in service register)

      if (existingUsers.length > 0) {
        // DELETE users with conflicting unique properties
        let userIds = existingUsers.map(conflictingEvent => conflictingEvent.userId);
        const distinctUserIds = new Set(userIds);

        for (let userId of distinctUserIds){
          // assert that unique fields are free to take
          // so if we get conflicting ones here, we can simply delete them
          const usersRepository = await getUsersRepository();
          await usersRepository.deleteOne(userId);

          this.logger.error(
            `User with id ${
            userId
            } was deleted because it was not found on service-register but uniqueness conflicted on service-core`
          );
        }
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
  async createUser(
    context: MethodContext,
    params: mixed,
    result,
    next: ApiCallback
  ) {
    // if it is testing user, skip registration process
    if (context.user.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user.id = result.id;
      return next();
    }

    try {
      const usersRepository = await getUsersRepository();
      context.user = await usersRepository.insertOne(context.user, true);
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
  async createUserInServiceRegister (
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
          id: context.user.id
        },
        host: { name: context.host },
        unique: SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutPrefix()
      };
      userStreamsIds.forEach(streamId => {
        if (context.user[streamId] != null) userData.user[streamId] = context.user[streamId];
      });

      await this.serviceRegisterConn.createUser(userData);
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
    result.username = context.user.username;
    result.apiEndpoint = context.user.getApiEndpoint();
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
      }
    );
    next();
  }
}

module.exports = Registration;
