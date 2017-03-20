// @flow

var errorHandling = require('components/errors').errorHandling;

interface Logger {
}


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
module.exports = function produceErrorHandlingMiddleware(logger: Logger) {
  /*eslint-disable no-unused-vars*/
  return function handleError(
    error: any, 
    req: express$Request, 
    res: express$Response, 
    next: () => void) 
  {
    errorHandling.logError(error, req, logger);
    res
      .status(error.httpStatus || 500)
      .json({
        error: errorHandling.getPublicErrorData(error)
      });
  };
};
module.exports.injectDependencies = true;
