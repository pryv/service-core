/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const commonFns = require('./../helpers/commonFunctions');
const errors = require('components/errors').factory;
const methodsSchema = require('components/api-server/src/schema/authMethods');
const ServiceRegister = require('components/business/src/auth/service_register');
const Deletion = require('components/business/src/auth/deletion');

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
module.exports = function (api, logging, storageLayer) {

  const deletion: Deletion = new Deletion(logging, storageLayer);

  api.register('auth.delete',
    deletion.validateUserExists.bind(deletion),
    deletion.deleteUser.bind(deletion)
  );
};