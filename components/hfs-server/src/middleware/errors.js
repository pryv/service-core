/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const errorHandling = require('errors').errorHandling;
const { APIError } = require('errors');


/** Produces a middleware function that will handle all errors and augment
 * them with a JSON error body. 
 * 
 * To use this, you need to add it to your middleware stack _after_ all other 
 * routes have been added. 
 *  
 * @param  {Logger} logger logger to use for `logError` call
 * @return {Function} express middleware function that logs errors and responds
 *    to them properly. 
 */ 
module.exports = function produceErrorHandlingMiddleware(logger) {
  /*eslint-disable no-unused-vars*/
  return function handleError(
    error: mixed, 
    req: express$Request, 
    res: express$Response, 
    next: express$NextFunction) 
  {
    let safeError: APIError; 
    if (error != null && error instanceof APIError) 
      safeError = error; 
    else  {
      // FLOW Assume that we can toString the mistery object
      safeError = new APIError(error.toString()); 
    }
    
    errorHandling.logError(safeError, req, logger);
    
    const status: number = safeError.httpStatus || 500;
    res
      .status(status)
      .json({
        error: errorHandling.getPublicErrorData(safeError)
      });
  };
};
