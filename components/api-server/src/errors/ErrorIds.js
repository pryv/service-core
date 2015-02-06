var commonIds = require('components/errors').ErrorIds,
    _ = require('lodash');

/**
 * Identifier constants for API errors (merge of API-server-specific and common ids).
 */
var ErrorIds = module.exports = _.extend({
  /**
   * Used for Socket.IO support.
   */
  InvalidMethod: 'invalid-method',
  InvalidCredentials: 'invalid-credentials',
  InvalidItemId: 'invalid-item-id',
  InvalidOperation: 'invalid-operation',
  InvalidParametersFormat: 'invalid-parameters-format',
  ItemAlreadyExists: 'item-already-exists',
  PeriodsOverlap: 'periods-overlap',
  UnsupportedContentType: 'unsupported-content-type',

  // those last two are not in use yet but already documented (see API reference for details)

  UserAccountRelocated: 'user-account-relocated',
  UserInterventionRequired: 'user-intervention-required'
}, commonIds);
Object.freeze(ErrorIds);
