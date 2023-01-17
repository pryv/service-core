/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Helper function for handling method responses.
 *
 * @param {Object} res
 * @param {Function} next
 * @param {Number|Function} successCode Can be a function accepting the result in arg
 *                                      and returning a number
 * @returns {Function}
 */
module.exports = function (res, next, successCode) {
  return function (err, result) {
    if (err != null) {
      return next(err);
    }
    if (result == null) { throw new Error('AF: either err or result must be non-null.'); }
    result.writeToHttpResponse(res, successCode);
  };
};
