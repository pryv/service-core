/**
 * Helper functions for error handling.
 */

var APIError = require('./APIError'),
    ErrorIds = require('./ErrorIds');

var errorHandling = module.exports = {};

/**
 * Logs the given error.
 *
 * @param {Error} error The error object (can be an API error or not)
 * @param {Object} req The request context; expected properties: url, method, body
 * @param {Object} logger The logger object (expected methods: debug, info, warn, error)
 */
errorHandling.logError = function (error, req, logger) {
  var metadata = {};
  if (req) {
    metadata.context = {
      location: req.url,
      method: req.method,
      data: req.body
    };
  }
  if (error instanceof APIError) {
    var logMsg = error.id + ' error (' + error.httpStatus + '): ' + error.message;
    if (error.data) {
      metadata.errorData = error.data;
    }
    if (error.innerError) {
      metadata.innerError = error.innerError.stack || error.innerError.message;
    }

    if (error.id === ErrorIds.UnexpectedError) {
      logger.warn(logMsg, metadata);
      logger.sendToErrorService(error);
    } else {
      logger.info(logMsg, metadata);
    }
  } else {
    logger.error('Unhandled API error (' + error.name + '): ' + error.message + '\n' + error.stack,
        metadata);
    logger.sendToErrorService(error);
  }
};

/**
 * Returns a public-safe error object from the given API error.
 *
 * @param {APIError} error
 * @return {Object}
 */
errorHandling.getPublicErrorData = function (error) {
  if (error instanceof APIError) {
    var publicError = {
      id: error.id,
      message: error.message
    };
    if (error.data) {
      publicError.data = error.data;
    }
    return publicError;
  } else {
    return {
      id: ErrorIds.UnexpectedError,
      message: 'An unexpected error occurred. Our bad! Please accept our humble apologies and ' +
          'notify us if it happens repeatedly. Thank you.'
    };
  }
};
