/**
 * Identifier constants for API errors.
 */
var ErrorIds = module.exports = {
  CorruptedData: 'corrupted-data',
  Forbidden: 'forbidden',
  InvalidAccessToken: 'invalid-access-token',
  InvalidCredentials: 'invalid-credentials',
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
  /**
   * Used for High-Frequency Series, allowing only predefined types
   */
  UnknownEventType: 'unknown-event-type',
  UnknownReferencedResource: 'unknown-referenced-resource',
  UnknownResource: 'unknown-resource',
  UnsupportedContentType: 'unsupported-content-type',
  /**
   * Used for Batch calls and Socket.IO events.get result storing
   */
  resultSizeExceeded: 'result-size-exceeded',

  // those last two are not in use yet but already documented (see API reference for details)

  UserAccountRelocated: 'user-account-relocated',
  UserInterventionRequired: 'user-intervention-required'
};
Object.freeze(ErrorIds);
