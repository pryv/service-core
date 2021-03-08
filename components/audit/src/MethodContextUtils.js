/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
function setAuditAccessId(accessId) {
  return function(context, params, result, next) {
    if (! context.access)  context.access = {};
    if (context.access.id) {
      return next(new Error('Access Id was already set to ' + context.access.id + ' when trying to set it to ' + accessId));
    }
    context.access.id = accessId;
    next();
  }
}

const AuditAccessIds = {
  VALID_PASSWORD: 'password',
  PASSWORD_RESET_REQUEST: 'password-reset-request',
  PASSWORD_RESET_TOKEN: 'password-reset-token',
  ADMIN_TOKEN: 'admin',
  PUBLIC: 'public'
}

Object.freeze(AuditAccessIds);

function skipAudit(context, params, result, next) {
  if (context == null) req.context = {};
  context.skipAudit = true;
  next();
}


module.exports = {
  setAuditAccessId: setAuditAccessId,
  skipAudit: skipAudit,
  AuditAccessIds: AuditAccessIds
}