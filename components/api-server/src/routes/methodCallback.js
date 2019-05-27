// @flow

import type Result from '../Result';

/**
 * Helper function for handling method responses.
 *
 * @param {Object} res
 * @param {Function} next
 * @param {Number|Function} successCode Can be a function accepting the result in arg
 *                                      and returning a number
 * @returns {Function}
 */
module.exports = function (res: express$Response, next: express$NextFunction, successCode: number) {
  return function (err: ?Error, result: ?Result) {

    addAccessIdHeader(res);

    if (err != null) {
      return next(err);
    }
    
    if (result == null)
      throw new Error('AF: either err or result must be non-null.');

    result.writeToHttpResponse(res, successCode);
  };
};

/**
 * Adds the id of the access (if any was used during API call)
 * within the `Pryv-Access-Id` header of the given result.
 * It is extracted from the request context.
 *
 * @param res {express$Response} Current express response. MODIFIED IN PLACE. 
 */
function addAccessIdHeader <T: express$Response>(res: T): T {
  const request = res.req;
  if (request != null) {
    const requestCtx = request.context;
    if (requestCtx != null && requestCtx.access != null) {
      res.header('Pryv-Access-Id', requestCtx.access.id);
    }
  }

  return res;
}
