/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 
const ErrorIds = require('./ErrorIds');
const { USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH } = require('api-server/src/schema/helpers');
/**
 * Identifier constants for API errors' messages.
 */
const ErrorMessages = {

  /**
   * Invitation token validation in the service-register
   */
  // ErrorIds.
  [ErrorIds.InvalidInvitationToken]: 'Invalid invitation',
  [ErrorIds.InvalidUsername]: 'Username should have between ' + USERNAME_MIN_LENGTH + ' and ' + USERNAME_MAX_LENGTH + ' characters and contain lowercase letters or numbers or dashes',
  [ErrorIds.UsernameRequired]: 'Username is required',
  [ErrorIds.InvalidEmail]: 'Invalid email',
  [ErrorIds.InvalidLanguage]: 'Invalid language',
  [ErrorIds.InvalidAppId]: 'Invalid app Id',
  [ErrorIds.Invalidreferer]: 'Invalid referer',
  [ErrorIds.InvalidInvitationToken]: 'Invalid invitation token',
  [ErrorIds.MissingRequiredField]: 'Missing required field',
  [ErrorIds.DeniedStreamAccess]: 'It is forbidden to access this stream.',
  [ErrorIds.TooHighAccessForSystemStreams]: 'Only read, create-only and contribute accesses are allowed for system streams',
  [ErrorIds.EmailRequired]: 'Email is required',
  [ErrorIds.PasswordRequired]: 'Password is required',
  [ErrorIds.InvalidPassword]: 'Password should have between 5 and 23 characters',
  [ErrorIds.ForbiddenMultipleAccountStreams]: 'Event cannot be part of multiple account streams.',
  [ErrorIds.ForbiddenAccountEventModification]: 'Forbidden event modification. You are trying to edit or delete a non-editable or active system stream event.',
  [ErrorIds.ForbiddenToChangeAccountStreamId]: 'It is forbidden to modify streamIds of system events.',
  [ErrorIds.ForbiddenAccountStreamsModification]: 'It is forbidden to modify system streams.',
  [ErrorIds.ForbiddenToEditNoneditableAccountFields]: 'It is forbidden to edit non-editable acccount fields.',
  [ErrorIds.UnexpectedError]: 'Unexpected error',
  [ErrorIds.NewPasswordFieldIsRequired]: 'newPassword field is required.',
  IndexedParameterInvalidFormat: 'Indexed parameters must be numbers or strings if required.',
};
Object.freeze(ErrorMessages);

module.exports = ErrorMessages;