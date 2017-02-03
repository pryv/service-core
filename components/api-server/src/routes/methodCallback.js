var setCommonMeta = require('../methods/helpers/setCommonMeta');

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
    if (err) {
      return next(err);
    }

    result.commit(res, successCode);

  };
};
