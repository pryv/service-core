/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const ErrorIds = require('./ErrorIds');
/**
 * Identifier constants for API errors' messages.
 */
const ErrorMessages = {

  /**
   * Invitation token validation in the service-register
   */
  // ErrorIds.
  [ErrorIds.InvalidInvitationToken]: 'Invalid invitation',
  /**
   * Username reservation validation in the service-register
   */
  [ErrorIds.ReservedUsername]: 'Reserved user starting by pryv',
  [ErrorIds.ExistingUsername]: 'Existing user',
  [ErrorIds.InvalidUsername]: 'Invalid username. Username should have from 5 to 23 characters and contain letters or numbers or dashes',
  [ErrorIds.ExistingEmail]: 'Existing e-mail',
  [ErrorIds.UsernameRequired]: 'Username is required',
  [ErrorIds.InvalidEmail]: 'Invalid email',
  [ErrorIds.InvalidLanguage]: 'Invalid language',
  [ErrorIds.InvalidAppId]: 'Invalid app Id',
  [ErrorIds.Invalidreferer]: 'Invalid referer',
  [ErrorIds.DuplicatedUserRegistration]: 'Duplicated user registration. User already started registration process in another server.',
  [ErrorIds.MissingRequiredField]: 'Missing required field',
};
Object.freeze(ErrorMessages);

module.exports = ErrorMessages;