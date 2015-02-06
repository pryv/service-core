/**
 * Identifier constants for common API errors. Extend as needed.
 */
var ErrorIds = module.exports = {
  CorruptedData: 'corrupted-data',
  Forbidden: 'forbidden',
  InvalidAccessToken: 'invalid-access-token',
  InvalidRequestStructure: 'invalid-request-structure',
  MissingHeader: 'missing-header',
  UnexpectedError: 'unexpected-error',
  UnknownReferencedResource: 'unknown-referenced-resource',
  UnknownResource: 'unknown-resource'
};
Object.freeze(ErrorIds);
