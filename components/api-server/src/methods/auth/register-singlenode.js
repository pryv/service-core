/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const Registration = require('components/business/src/auth/registration');


/**
 * Auth API methods implementations.
 *
 * @param api
 * @param userAccessesStorage
 * @param sessionsStorage
 * @param authSettings
 */
module.exports = function (api, logging, storageLayer, servicesSettings, serverSettings) {
  // REGISTER
  const registration = new Registration(logging, storageLayer, servicesSettings, serverSettings);

  api.register('auth.register.singlenode',
    // data validation methods
    registration.loadCustomValidationSettings,
    // user registration methods
    registration.prepareUserDataForSaving,
    registration.createUser,
    registration.sendWelcomeMail
  );
};