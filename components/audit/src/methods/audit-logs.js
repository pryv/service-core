/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('errors').factory,
  async = require('async'),
  commonFns = require('api-server/src/methods/helpers/commonFunctions'),
  methodsSchema = require('../schema/auditMethods');

const audit = require('audit');
const auditStorage = audit.storage;

/**
* @param api
*/
module.exports = function (api) {
  api.register('audit.getLogs',
    commonFns.getParamsValidation(methodsSchema.get.params),
    getAuditLogs);
}

function getAuditLogs(context, params, result, next) {

  try {
    const userStorage = auditStorage.forUser(context.user.id);
    result.addStream('auditLogs', userStorage.getLogsStream(params));
    //result.auditLogs = userStorage.getLogs(params);
  } catch (err) {
    return next(err);
  }     

  next();
}