/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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

  /**
   * Invitation token validation in the service-register
   */
  InvalidInvitationToken: 'invitationToken-invalid',
  InvalidUsername: 'username-invalid',
  UsernameRequired: 'username-required',
  InvalidEmail: 'email-invalid',
  InvalidLanguage: 'language-invalid',
  InvalidAppId: 'appid-invalid',
  InvalidPassword: 'password-invalid',
  Invalidreferer: 'referer-invalid',

  /**
   * Throw this error for methods that are valid only for pryv.io
   */
  DeniedStreamAccess: 'denied-stream-access',
  TooHighAccessForAccountStreams: 'too-high-access-for-account-stream',
  ForbiddenMultipleAccountStreams: 'forbidden-multiple-account-streams-events',
  EmailRequired: 'email-required',
  PasswordRequired: 'password-required',
  ForbiddenAccountEventModification: 'forbidden-none-editable-account-streams',
  ForbiddenToChangeAccountStreamId: 'forbidden-change-account-streams-id',
  ForbiddenAccountStreamsModification: 'forbidden-account-streams-actions',
  ForbiddenToEditNoneditableAccountFields: 'forbidden-to-edit-noneditable-account-fields',
  MissingRequiredField: 'missing-required-field',
  NewPasswordFieldIsRequired: 'newPassword-required',
};
Object.freeze(ErrorIds);

module.exports = ErrorIds;