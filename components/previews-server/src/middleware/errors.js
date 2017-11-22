var errorHandling = require('components/errors').errorHandling;

/*jshint -W098*/

/**
 * Error route handling.
 * TODO: (re)move that once something's been done about api-server's own errors middleware
 */
module.exports = function (logging) {
  var logger = logging.getLogger('routes');

  /*eslint-disable no-unused-vars*/
  return function handleError(error, req, res, next) {
    errorHandling.logError(error, req, logger);
    res
      .status(error.httpStatus || 500)
      .json({
        error: errorHandling.getPublicErrorData(error)
      });
  };
};
module.exports.injectDependencies = true;
