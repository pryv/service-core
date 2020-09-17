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
  [ErrorIds.Existing_username]: 'Existing user',
  [ErrorIds.InvalidUsername]: 'Username should have from 5 to 23 characters and contain letters or numbers or dashes',
  [ErrorIds.Existing_email]: 'Existing e-mail',
  [ErrorIds.UsernameRequired]: 'Username is required',
  [ErrorIds.InvalidEmail]: 'Invalid email',
  [ErrorIds.InvalidLanguage]: 'Invalid language',
  [ErrorIds.InvalidAppId]: 'Invalid app Id',
  [ErrorIds.Invalidreferer]: 'Invalid referer',
  [ErrorIds.InvalidInvitationToken]: 'Invalid invitation token',
  [ErrorIds.DuplicatedUserRegistration]: 'Duplicated user registration. User already started registration process in another server.',
  [ErrorIds.MissingRequiredField]: 'Missing required field',
  [ErrorIds.NonValidForOpenSource]: 'Not valid method for open pryv',
  [ErrorIds.DeniedEventModification]: 'Event modification was not done, perhaps you are trying to edit a account stream event like user data or trying to delete active event.',
  [ErrorIds.DeniedStreamAccess]: 'It is forbidden to access this stream.',
  [ErrorIds.TooHighAccessForAccountStreams]: 'Only read and contribute acceesses are allowed for the account sterams',
  [ErrorIds.EmailRequired]: 'Email is required',
  [ErrorIds.PasswordRequired]: 'Password is required',
  [ErrorIds.InvalidPassword]: 'Password should have from 5 to 23 characters',
  [ErrorIds.DeniedMultipleAccountStreams]: 'It is not allowed to save the event with multiple account streams',
  [ErrorIds.UnexpectedErrorWhileSavingTheEvent]: 'Unexpected error while saving the event, please try again in a minute.',
  [ErrorIds.UnexpectedErrorWhileSavingAccount]: 'Unexpected error while saving account information, please try again in a minute.',
  [ErrorIds.UnexpectedErrorWhileCreatingUser]: 'Unexpected error while creating a user.',
};
Object.freeze(ErrorMessages);

module.exports = ErrorMessages;