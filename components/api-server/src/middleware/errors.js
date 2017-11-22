'use strict';
// @flow

var errors = require('components/errors'),
    APIError = errors.APIError,
    ErrorIds = errors.ErrorIds,
    errorHandling = errors.errorHandling,
    setCommonMeta = require('../methods/helpers/setCommonMeta');

/** Error route handling.
 */
module.exports = function produceHandleErrorMiddleware(logging: any) {
  var logger = logging.getLogger('routes');

  // NOTE next is not used, since the request is terminated on all errors. 
  /*eslint-disable no-unused-vars*/
  return function handleError(error, req: express$Request, res: express$Response, next: () => void) {
    if (! (error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = new APIError(ErrorIds.InvalidRequestStructure, error.message,
          {httpStatus: error.status});
    }

    errorHandling.logError(error, req, logger);
    res
      .status(error.httpStatus || 500)
      .json(
        setCommonMeta(
          {error: errorHandling.getPublicErrorData(error)}));
  };
};
module.exports.injectDependencies = true;
