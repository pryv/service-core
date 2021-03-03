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

const audit = require('audit');

(async () => {
  await commonMeta.loadSettings();
})();

/** Error route handling.
 */
function produceHandleErrorMiddleware(logging: any) {
  const logger = logging.getLogger('error-middleware');
 
  // NOTE next is not used, since the request is terminated on all errors. 
  /*eslint-disable no-unused-vars*/
  return function handleError(error, req: express$Request, res: express$Response, next: () => void) {
    if (! (error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = errorsFactory.invalidRequestStructure(error.message);
    }

    //audit.apiCall(req.pryv.actionId, req.context, {}, error);

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
