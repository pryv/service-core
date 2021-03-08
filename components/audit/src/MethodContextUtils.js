function addAuditAccessId(accessId) {
  return function(context, params, result, next) {
    if (! context.access)  context.access = {};
    if (! context.access.id)  context.access.id = accessId;
    next();
  }
}

const AuditAccessIds = {
  VALID_PASSWORD: 'password',
  PASSWORD_RESET_REQUEST: 'password-reset-request',
  PASSWORD_RESET_TOKEN: 'password-reset-token',
  ADMIN_TOKEN: 'admin'
}

Object.freeze(AuditAccessIds);


module.exports = {
  addAuditAccessId: addAuditAccessId,
  AuditAccessIds: AuditAccessIds
}