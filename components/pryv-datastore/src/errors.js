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
  unexpectedError,
  invalidRequestStructure,
  unknownResource,
  itemAlreadyExists,
  invalidItemId,
  unsupportedOperation,
  _setFactory,
};

/**
 * Match internal APIError ids for consistency.
 */
const ErrorIds = {
  UnexpectedError: 'unexpected-error',
  InvalidRequestStructure: 'invalid-request-structure',
  UnknownResource: 'unknown-resource',
  ItemAlreadyExists: 'item-already-exists',
  InvalidItemId: 'invalid-item-id',
  UnsupportedOperation: 'unsupported-operation',
};

function unexpectedError(message: string, data?: Object, innerError?: Error): PryvDataSourceError {

  return createError(ErrorIds.UnexpectedError, message, data, innerError);
}


function invalidRequestStructure(message: string, data?: Object, innerError?: Error): PryvDataSourceError {
  if (_factory) return _factory.invalidRequestStructure(message, data, innerError);
  return createError(ErrorIds.InvalidRequestStructure, message, data, innerError);
}

function unknownResource(resourceType: ?string, id: ?string, innerError?: Error): PryvDataSourceError {
  if (_factory) return _factory.unknownResource(resourceType, id, innerError);
  const message = `Unknown ${resourceType || 'resource'} ${id ? `"${id}"` : ''}`;
  return createError(ErrorIds.UnknownResource, message, null, innerError);
}

function itemAlreadyExists(resourceType: ?string, conflictingKeys: { [string]: string }, innerError?: Error): PryvDataSourceError {
  if (_factory) return _factory.itemAlreadyExists(resourceType, conflictingKeys, innerError);
  const message = `${resourceType || 'Resource'} already exists with conflicting keys: ${JSON.stringify(conflictingKeys)}`;
  return createError(ErrorIds.ItemAlreadyExists, message, {confictingKey : conflictingKeys}, innerError);
}

function invalidItemId(message: string): PryvDataSourceError {
  if (_factory) return _factory.invalidItemId(message);
  return createError(ErrorIds.InvalidItemId, message, data, innerError);
}

function unsupportedOperation(message: string): PryvDataSourceError {
  if (_factory) return _factory.unsupportedOperation(message);
  return createError(ErrorIds.UnsupportedOperation, message, data, innerError);
}

function createError (id: string, message: string, data?: Object, innerError?: Error): PryvDataSourceError {
  return new PryvDataSourceError(id, message, data, innerError);
}

class PryvDataSourceError extends Error {
  id: string;
  data: ?Object;
  innerError: ?Error;

  constructor(id: string, message: string, data?: Object, innerError?: Error) {
    super(message);
    this.id = id;
    this.data = data || null;
    this.innerError = innerError || null;
  }
}

// ---------------- error factory ----------------

let _factory = null;

/**
 * Used to map errors to API errors.
 * @param {*} factory 
 */
function _setFactory(factory: Object) {
  _factory = factory;
}