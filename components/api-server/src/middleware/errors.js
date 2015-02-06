var errors = require('components/errors'),
    APIError = errors.APIError,
    ErrorIds = errors.ErrorIds,
    errorHandling = errors.errorHandling,
    setCommonMeta = require('../methods/setCommonMeta');

/*jshint -W098*/

/**
 * Error route handling.
 */
module.exports = function (logging) {
  var logger = logging.getLogger('routes');

  return function handleError(error, req, res, next) {
    if (! (error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = new APIError(ErrorIds.InvalidRequestStructure, error.message,
          {httpStatus: error.status});
    }

    errorHandling.logError(error, req, logger);
    res.json(setCommonMeta({error: errorHandling.getPublicErrorData(error)}),
        error.httpStatus || 500);
  };
};
module.exports.injectDependencies = true;
