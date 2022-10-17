/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
function setAuditAccessId(accessId) {
  return function(context, params, result, next) {
    if (! context.access)  context.access = {};
    if (context.access.id != null) {
      return next(new Error('Access Id was already set to ' + context.access.id + ' when trying to set it to ' + accessId));
    }
    context.access.id = accessId;
    next();
  }
}

const AuditAccessIds = {
  VALID_PASSWORD: 'valid-password',
  PASSWORD_RESET_REQUEST: 'password-reset-request',
  PASSWORD_RESET_TOKEN: 'password-reset-token',
  ADMIN_TOKEN: 'admin',
  PUBLIC: 'public',
  INVALID: 'invalid',
}

Object.freeze(AuditAccessIds);


module.exports = {
  setAuditAccessId: setAuditAccessId,
  AuditAccessIds: AuditAccessIds,
}