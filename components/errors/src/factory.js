/**
 * Helper "factory" methods for common API errors (see error ids). Extend as needed.
 */

var APIError = require('./APIError'),
    ErrorIds = require('./ErrorIds');

exports.corruptedData = function (message, innerError) {
  return new APIError(ErrorIds.CorruptedData, message, {
    httpStatus: 422,
    innerError: innerError
  });
};

exports.forbidden = function (message) {
  if (! message) {
    message = 'The given token\'s access permissions do not allow this operation.';
  }
  return new APIError(ErrorIds.Forbidden, message, {httpStatus: 403});
};

exports.invalidAccessToken = function (message, innerError) {
  return new APIError(ErrorIds.InvalidAccessToken, message, {
    httpStatus: 401,
    innerError: innerError
  });
};

exports.missingHeader = function (headerName) {
  return new APIError(ErrorIds.MissingHeader, 'Missing expected header "' + headerName + '"',
      {httpStatus: 400});
};

exports.unexpectedError = function (sourceError, message) {
  return new APIError(ErrorIds.UnexpectedError,
      message || ('Unexpected error: ' + sourceError.message), {
    httpStatus: 500,
    innerError: sourceError
  });
};

/**
 * @param {String} resourceType
 * @param {String} paramKey
 * @param {String|Array} value
 * @param {Error} innerError
 * @returns {APIError}
 */
exports.unknownReferencedResource = function (resourceType, paramKey, value, innerError) {
  var message = 'Unknown referenced ' + (resourceType || 'resource(s)') + ' "' +
      (value.join ? value.join('", "') : value) + '"';
  var data = {};
  data[paramKey] = value;
  return new APIError(ErrorIds.UnknownReferencedResource, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

exports.unknownResource = function (resourceType, id, innerError) {
  var message = 'Unknown ' + (resourceType || 'resource') + ' ' + (id ? '"' + id + '"' : '');
  return new APIError(ErrorIds.UnknownResource, message, {
    httpStatus: 404,
    innerError: innerError
  });
};
