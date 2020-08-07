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
const Registration = require('components/business/src/auth/registration');

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
module.exports = function (api, logging, storageLayer, servicesSettings, serverSettings, systemStreamsSettings) {
  // REGISTER
  const registration = new Registration(logging, storageLayer, servicesSettings, serverSettings, systemStreamsSettings);

  api.register('auth.register.singlenode',
    // data validation methods
    commonFns.getParamsValidation(methodsSchema.register.params),
    // validateUser,
    // user registration methods
    registration.prepareUserDataForSaving,
    registration.createUser,
    registration.sendWelcomeMail
  );
/* TODO IEVA - remove
  async function validateUser(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      // check email in service-core
      // TODO IEVA - rethink if there are scenarious when this query is not enough
      const existingUser = await bluebird.fromCallback(
        (cb) => storageLayer.events.findOne({}, { $and: [{ streamIds: { $in: ['username', 'email'] } }, { $or: [{ content: params.email }, { content: params.username }] }]}, null, cb)
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
  }*/
};
module.exports.injectDependencies = true;