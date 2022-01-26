/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

/**
 * Errors factory, provided as a helper for external implementations.
 */
const errors = module.exports = {
  invalidRequestStructure,
  unknownResource
};

/**
 * Match internal APIError ids for consistency.
 */
const ErrorIds = {
  InvalidRequestStructure: 'invalid-request-structure',
  UnknownResource: 'unknown-resource'
};

function invalidRequestStructure(message: string, data?: Object, innerError?: Error): APIError {
  return createError(ErrorIds.InvalidRequestStructure, message, data, innerError);
}

function unknownResource(resourceType: ?string, id: ?string, innerError?: Error): APIError {
  const message = `Unknown ${resourceType || 'resource'} ${id ? `"${id}"` : ''}`;
  return createError(ErrorIds.UnknownResource, message, null, innerError);
}

function createError (id: string, message: string, data?: Object, innerError?: Error): Error {
  const err = new Error(message);
  err.id = id;
  err.data = data || null;
  err.innerError = innerError || null;
  return err;
}
