/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const errors = require('components/errors');
const errorsFactory = errors.factory;
const APIError = errors.APIError;
const errorHandling = errors.errorHandling;
const commonMeta = require('../methods/helpers/setCommonMeta');

const { getReggol } = require('boiler');

(async () => {
  await commonMeta.loadSettings();
})();

/** Error route handling.
 */
function produceHandleErrorMiddleware(logging: any, airbrakeNotifier: any) {
  const logger = logging.getReggol('error-middleware');
  const notifier = airbrakeNotifier?.airbrakeNotifier;

  // NOTE next is not used, since the request is terminated on all errors. 
  /*eslint-disable no-unused-vars*/
  return function handleError(error, req: express$Request, res: express$Response, next: () => void) {
    if (! (error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = errorsFactory.invalidRequestStructure(error.message);
    }

    errorHandling.logError(error, req, logger);

    if (notifier != null & ! error.dontNotifyAirbrake) {
      notifier.notify(error);
    }

    res
      .status(error.httpStatus || 500)
      .json(
        commonMeta.setCommonMeta(
          {error: errorHandling.getPublicErrorData(error)}));
  };
}

module.exports = produceHandleErrorMiddleware;
