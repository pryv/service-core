/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const errors = require('errors');
const errorsFactory = errors.factory;
const APIError = errors.APIError;
const errorHandling = errors.errorHandling;
const commonMeta = require('../methods/helpers/setCommonMeta');

const { getLogger, notifyAirbrake } = require('@pryv/boiler');

const { getConfigUnsafe } = require('@pryv/boiler');

(async () => {
  await commonMeta.loadSettings();
})();

/** Error route handling.
 */
function produceHandleErrorMiddleware(logging: any) {
  const logger = logging.getLogger('error-middleware');

  const config = getConfigUnsafe();
  const isAuditActive = (! config.get('openSource:isActive')) && config.get('audit:active');
  
  let audit;
  if (isAuditActive) {
    audit = require('audit');
  }

  // NOTE next is not used, since the request is terminated on all errors. 
  /*eslint-disable no-unused-vars*/
  return async function handleError(error, req: express$Request, res: express$Response, next: () => void) {
    if (! (error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = errorsFactory.invalidRequestStructure(error.message);
    }

    if (req.context != null) { // context is not initialized in case of malformed JSON
      
      if (isAuditActive) await audit.errorApiCall(req.context, error);
      req.context.tracing.finishSpan('express');
    }

    errorHandling.logError(error, req, logger);

    if (! error.dontNotifyAirbrake) {
      notifyAirbrake(error);
    }
    

    res
      .status(error.httpStatus || 500)
      .json(
        commonMeta.setCommonMeta(
          {error: errorHandling.getPublicErrorData(error)}));
  };
}

module.exports = produceHandleErrorMiddleware;
