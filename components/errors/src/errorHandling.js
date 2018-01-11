// @flow

/**
 * Helper functions for error handling.
 */

var APIError = require('./APIError'),
    ErrorIds = require('./ErrorIds');

var errorHandling = module.exports = {};

import type {Logger} from 'components/utils';

/**
 * Logs the given error.
 *
 * @param {Error} error The error object (can be an API error or not)
 * @param {Object} req The request context; expected properties: url, method, body
 * @param {Object} logger The logger object (expected methods: debug, info, warn, error)
 */
errorHandling.logError = function (error: any, req: express$Request, logger: Logger) {
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
      metadata.innerError = error.id === ErrorIds.UnexpectedError ?
        (error.innerError.stack || error.innerError.message) : error.innerError.message;
    }

    if (error.id === ErrorIds.UnexpectedError) {
      logger.warn(logMsg, metadata);
    } else {
      logger.info(logMsg, metadata);
    }
  } else {
    logger.error('Unhandled API error (' + error.name + '): ' + error.message + '\n' + error.stack,
        metadata);
  }
};

/**
 * Returns a public-safe error object from the given API error.
 */
errorHandling.getPublicErrorData = function (error: any) {
  if (error instanceof APIError) {
    let publicError = {
      id: error.id,
      message: error.message, 
      data: undefined, 
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
