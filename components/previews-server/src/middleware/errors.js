/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errorHandling = require('errors').errorHandling;
const APIError = require('errors').APIError;
const errors = require('errors').factory;
const { getLogger } = require('@pryv/boiler');

/*jshint -W098*/

/**
 * Error route handling.
 * TODO: (re)move that once something's been done about api-server's own errors middleware
 */
module.exports = function (logging) {
  const logger = getLogger('routes');

  /*eslint-disable no-unused-vars*/
  return function handleError(error, req, res, next) {
    if (!(error instanceof APIError)) {
      error = errors.unexpectedError(error);
    }

    errorHandling.logError(error, req, logger);
    res
      .status(error.httpStatus || 500)
      .json({
        error: errorHandling.getPublicErrorData(error)
      });
  };
};
