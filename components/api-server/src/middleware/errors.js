/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const errors = require('errors');
const errorsFactory = errors.factory;
const APIError = errors.APIError;
const errorHandling = errors.errorHandling;
const commonMeta = require('../methods/helpers/setCommonMeta');
const { getConfigUnsafe } = require('@pryv/boiler');

module.exports = produceHandleErrorMiddleware;

(async () => {
  await commonMeta.loadSettings();
})();

/**
 * Error route handling.
 * @param {any} logging
 * @returns {(error: any, req: any, res: any, next: () => void) => Promise<void>}
 */
function produceHandleErrorMiddleware (logging) {
  const logger = logging.getLogger('error-middleware');
  const config = getConfigUnsafe();
  const isAuditActive = !config.get('openSource:isActive') && config.get('audit:active');
  let audit;
  if (isAuditActive) {
    audit = require('audit');
  }
  // NOTE next is not used, since the request is terminated on all errors.
  /* eslint-disable no-unused-vars */
  return async function handleError (error, req, res, next) {
    if (!(error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = errorsFactory.invalidRequestStructure(error.message);
    }
    if (req.context != null) {
      // context is not initialized in case of malformed JSON
      if (isAuditActive) { await audit.errorApiCall(req.context, error); }
      // req.context.tracing.finishSpan('express1');
    }
    errorHandling.logError(error, req, logger);
    res
      .status(error.httpStatus || 500)
      .json(commonMeta.setCommonMeta({
        error: errorHandling.getPublicErrorData(error)
      }));
  };
}
