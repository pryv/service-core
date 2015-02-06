var errors = require('components/errors'),
    APIError = errors.APIError,
    ErrorIds = errors.ErrorIds;

/**
 * '404' handling to override Express' defaults. Must be set after the routes in the init sequence.
 */
module.exports = function (req, res, next) {
  return next(new APIError(ErrorIds.UnknownResource, 'Unknown resource', {httpStatus: 404}));
};
