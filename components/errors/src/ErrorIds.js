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
  InvalidInvitationToken: 'invitationtoken-invalid',
  /**
   * Username reservation validation in the service-register
   */
  ReservedUsername: 'username-reserved',
  // TODO IEVA - how to keep it simple and consistent?
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
  NonValidForOpenSource: 'not-valid-for-open-pryv',
  /**
   * Denied event modification perhaps of belonging to the core streams
   */
  DeniedEventModification: 'denied-event-modification',
  DeniedMultipleCoreStreams: 'denied-multiple-core-streams-events',
  EmailRequired: 'email-required',
  PasswordRequired: 'password-required',
  UnexpectedErrorWhileSavingTheEvent: 'unexpected-error-while-saving-the-event',
};
Object.freeze(ErrorIds);

module.exports = ErrorIds;