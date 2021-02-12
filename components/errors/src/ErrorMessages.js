/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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
  [ErrorIds.InvalidUsername]: 'Username should have from 5 to 23 characters and contain lowercase letters or numbers or dashes',
  [ErrorIds.UsernameRequired]: 'Username is required',
  [ErrorIds.InvalidEmail]: 'Invalid email',
  [ErrorIds.InvalidLanguage]: 'Invalid language',
  [ErrorIds.InvalidAppId]: 'Invalid app Id',
  [ErrorIds.Invalidreferer]: 'Invalid referer',
  [ErrorIds.InvalidInvitationToken]: 'Invalid invitation token',
  [ErrorIds.MissingRequiredField]: 'Missing required field',
  [ErrorIds.DeniedStreamAccess]: 'It is forbidden to access this stream.',
  [ErrorIds.TooHighAccessForAccountStreams]: 'Only read and contribute accesses are allowed for the account streams',
  [ErrorIds.EmailRequired]: 'Email is required',
  [ErrorIds.PasswordRequired]: 'Password is required',
  [ErrorIds.InvalidPassword]: 'Password should have from 5 to 23 characters',
  [ErrorIds.ForbiddenMultipleAccountStreams]: 'Event cannot be part of multiple account streams.',
  [ErrorIds.ForbiddenNoneditableAccountStreamsEdit]: 'Forbidden event modification, you are trying to edit a system event or trying to delete active system event.',
  [ErrorIds.ForbiddenNoneditableAccountStreamsEventsDeletion]: 'It is forbidden to delete non-editable or active system events.',
  [ErrorIds.ForbiddenToChangeAccountStreamId]: 'It is forbidden to change system stream id.',
  [ErrorIds.ForbiddenAccountStreamsActions]: 'It is forbidden to modify system streams.',
  [ErrorIds.ForbiddenAccountStreamsEventDeletion]: 'It is forbidden to delete non-editable or active system events.',
  [ErrorIds.ForbiddenToEditNoneditableAccountFields]: 'It is forbidden to edit non-editable acccount fields.',
  [ErrorIds.UnexpectedError]: 'Unexpected error',
  [ErrorIds.NewPasswordFieldIsRequired]: 'newPassword field is required.',
};
Object.freeze(ErrorMessages);

module.exports = ErrorMessages;