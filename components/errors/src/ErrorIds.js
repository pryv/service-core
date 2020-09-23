/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/**
 * Identifier constants for API errors.
 */
const ErrorIds = {
  ApiUnavailable: 'api-unavailable',
  CorruptedData: 'corrupted-data',
  Forbidden: 'forbidden',
  InvalidAccessToken: 'invalid-access-token',
  InvalidCredentials: 'invalid-credentials',
  InvalidAuthorizationKey: 'invalid-authorization-key',

  /**
   * Used for High-Frequency Series, allowing only known, simple types.
   */
  InvalidEventType: 'invalid-event-type',
  InvalidItemId: 'invalid-item-id',
  /**
   * Used for Socket.IO support.
   */
  InvalidMethod: 'invalid-method',
  InvalidOperation: 'invalid-operation',
  InvalidParametersFormat: 'invalid-parameters-format',
  InvalidRequestStructure: 'invalid-request-structure',
  ItemAlreadyExists: 'item-already-exists',
  MissingHeader: 'missing-header',
  PeriodsOverlap: 'periods-overlap',
  UnexpectedError: 'unexpected-error',
  UnknownReferencedResource: 'unknown-referenced-resource',
  UnknownResource: 'unknown-resource',
  UnsupportedContentType: 'unsupported-content-type',
  /**
   * Used for Batch calls and Socket.IO events.get result storing
   */
  TooManyResults: 'too-many-results',
  /**
   * Used for removed API methods
   */
  Gone: 'removed-method',
  /**
   * Used for open source version
   */
  unavailableMethod: 'unavailable-method',

  // those last two are not in use yet but already documented (see API reference for details)

  UserAccountRelocated: 'user-account-relocated',
  UserInterventionRequired: 'user-intervention-required',

  /**
   * Invitation token validation in the service-register
   */
  InvalidInvitationToken: 'invitationToken-invalid',
  /**
   * Username reservation validation in the service-register
   */
  ReservedUsername: 'username-reserved',
  Existing_username: 'username-exists',
  Existing_email: 'email-exists',
  InvalidUsername: 'username-invalid',
  UsernameRequired: 'username-required',
  InvalidEmail: 'email-invalid',
  InvalidLanguage: 'language-invalid',
  InvalidAppId: 'appid-invalid',
  InvalidPassword: 'password-invalid',
  Invalidreferer: 'referer-invalid',
  DuplicatedUserRegistration: 'duplicated-user-registration',

  /**
   * Throw this error for methods that are valid only for pryv.io
   */
  DeniedStreamAccess: 'denied-stream-access',
  TooHighAccessForAccountStreams: 'too-high-access-for-account-stream',
  ForbiddenMultipleAccountStreams: 'forbidden-multiple-account-streams-events',
  EmailRequired: 'email-required',
  PasswordRequired: 'password-required',
  ForbiddenNoneditableAccountStreamsEdit: 'forbidden-noneditable-account-streams-edit',
  ForbiddenNoneditableAccountStreamsEventsDeletion: 'forbidden-noneditable-account-streams-events-deletion',
  ForbiddenToChangeAccountStreamId: 'forbidden-change-account-streams-id',
  ForbiddenAccountStreamsActions: 'forbidden-account-streams-actions',
  ForbiddenAccountStreamsEventDeletion: 'forbidden-account-streams-deletion',
  ForbiddenToEditNoneditableAccountFields: 'forbidden-to-edit-noneditable-account-fields',
};
Object.freeze(ErrorIds);

module.exports = ErrorIds;