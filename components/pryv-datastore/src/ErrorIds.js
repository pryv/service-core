/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Identifier constants for data store errors.
 */
const ErrorIds = module.exports = {
  UnexpectedError: 'unexpected-error',
  InvalidRequestStructure: 'invalid-request-structure',
  UnknownResource: 'unknown-resource',
  ItemAlreadyExists: 'item-already-exists',
  InvalidItemId: 'invalid-item-id',
  UnsupportedOperation: 'unsupported-operation'
};
Object.freeze(ErrorIds);
