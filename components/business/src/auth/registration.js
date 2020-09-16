/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const cuid = require('cuid');
const errors = require('components/errors').factory;
const { errorHandling } = require('components/errors');
const mailing = require('components/api-server/src/methods/helpers/mailing');
const ServiceRegister = require('./service_register');
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
  storageLayer: any;
  serviceRegisterConn: ServiceRegister;
  userRepository: UserRepository; 
  accountStreamsSettings: any = SystemStreamsSerializer.getFlatAccountStreamSettings();
  servicesSettings: any; // settigns to get the email to send user welcome email

  constructor(logging, storageLayer, servicesSettings) {
    this.logger = logging.getLogger('business/registration');
    this.storageLayer = storageLayer;
    this.servicesSettings = servicesSettings;

    this.serviceRegisterConn = new ServiceRegister(
      servicesSettings.register,
      logging.getLogger('service-register')
    );
    this.userRepository = new UserRepository(this.storageLayer.events);
    this.POOL_USERNAME_PREFIX = 'pool@';
    this.TEMP_USERNAME_PREFIX = 'temp@';
    this.POOL_REGEX = new RegExp('^' + this.POOL_USERNAME_PREFIX);
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
      for (const [streamIdWithDot, streamSettings] of Object.entries(this.accountStreamsSettings)) {
        // if key is set as required - add required validation
        if (streamSettings.isUnique && streamSettings.isUnique === true) {
          let streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamIdWithDot)
          uniqueFields[streamIdWithoutDot] = context.user[streamIdWithoutDot];
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
   *
   * !!! Not solved scenario if main user info was saved in service-register, but
   * additional unique fields were not TODO IEVA
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
      const existingUsers = await this.userRepository.findConflictingUniqueFields(context.user.getUniqueFields());

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
          await this.userRepository.deleteOne(userId);

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
   * DEPRECATED
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  createPoolUser (context, params, result, next) {
    const uniqueId = cuid();
    params.username = this.POOL_USERNAME_PREFIX + uniqueId;
    params.passwordHash = 'changeMe';
    params.language = 'en';
    params.email = this.POOL_USERNAME_PREFIX + uniqueId + '@email';
    context.user = new User(params);
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
    // if it is testing user, skip registration process
    if (context.user.username === 'recla') {
      result.id = 'dummy-test-user';
      context.user.id = result.id;
      return next();
    }

    try {
      if (context.calledMethodId === 'system.createPoolUser') {
        context.user = await this.userRepository.insertOne( context.user );
      } else {
        context.user = await this.userRepository.insertOne(
          context.user,
          this.storageLayer.sessions,
          this.storageLayer.accesses,
        );
      }

      // form the result for system call or full registration call
      if (context.calledMethodId === 'system.createUser') {
        result.id = context.user.id;
      } else {
        result.username = context.user.username;
        result.apiEndpoint = context.user.getApiEndpoint();
      }
      next();
    } catch (err) {
      return next(Registration.handleUniquenessErrors(err, null, params));
    }
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
      const userStreamsIds = SystemStreamsSerializer.getIndexedAccountStreamsIdsWithoutDot();
      const uniqueStreamsIds = SystemStreamsSerializer.getUniqueAccountStreamsIdsWithoutDot();

      // form data that should be sent to service-register
      // some default values and indexed/uinique fields of the system
      const userData = {
        user: {
          id: context.user.id
        },
        host: { name: context.host },
      };
      userStreamsIds.forEach(streamId => {
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
        next();
      }
    );
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
      let fieldName = err.duplicateIndex();
      // uniqueness constrain for username in acccess
      if (fieldName == 'deviceName') {
        fieldName = 'username';
      }
      uniquenessErrors[fieldName] = params[fieldName];     
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
