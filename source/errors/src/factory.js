var APIError = require('./APIError'),
    ErrorIds = require('./ErrorIds'),
    _ = require('lodash');

/**
 * Helper "factory" methods for API errors (see error ids).
 */
var factory = module.exports = {};

factory.corruptedData = function (message, innerError) {
  return new APIError(ErrorIds.CorruptedData, message, {
    httpStatus: 422,
    innerError: innerError
  });
};

factory.forbidden = function (message) {
  if (! message) {
    message = 'The given token\'s access permissions do not allow this operation.';
  }
  return new APIError(ErrorIds.Forbidden, message, {httpStatus: 403});
};

factory.invalidAccessToken = function (message, innerError) {
  return new APIError(ErrorIds.InvalidAccessToken, message, {
    httpStatus: 401,
    innerError: innerError
  });
};

factory.invalidCredentials = function (message) {
  return new APIError(ErrorIds.InvalidCredentials,
      message || 'The given username/password pair is invalid.',
      {httpStatus: 401});
};

factory.invalidEventType = function (type) {
  return new APIError(ErrorIds.InvalidEventType, 'Event type \'' + type + '\' not allowed ' +
    'for High-Frequency Series. Please use a predefined simple type',
    {type: type, httpStatus: 400});
};

factory.invalidItemId = function (message) {
  return new APIError(ErrorIds.InvalidItemId, message, {httpStatus: 400});
};

factory.invalidMethod = function (methodId) {
  return new APIError(ErrorIds.InvalidMethod, 'Invalid method id "' + methodId + '"',
      {httpStatus: 404});
};

factory.invalidOperation = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidOperation, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

factory.invalidParametersFormat = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidParametersFormat, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

factory.invalidRequestStructure = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidRequestStructure, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

factory.itemAlreadyExists = function (resourceType, conflictingKeys, innerError) {
  resourceType = resourceType || 'resource';
  var article = _.includes(['a', 'e', 'i', 'o', 'u'], resourceType[0]) ? 'An ' : 'A ';
  var keysDescription = Object.keys(conflictingKeys).map(function (k) {
    return k + ' "' + conflictingKeys[k] + '"';
  }).join(', ');
  var message = article + resourceType + ' with ' + keysDescription +
      ' already exists';
  return new APIError(ErrorIds.ItemAlreadyExists, message, {
    httpStatus: 400,
    innerError: innerError,
    data: conflictingKeys
  });
};

factory.missingHeader = function (headerName) {
  return new APIError(ErrorIds.MissingHeader, 'Missing expected header "' + headerName + '"',
      {httpStatus: 400});
};

factory.periodsOverlap = function (message, data, innerError) {
  return new APIError(ErrorIds.PeriodsOverlap, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

factory.unexpectedError = function (sourceError, message) {
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
factory.unknownReferencedResource = function (resourceType, paramKey, value, innerError) {
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

factory.unknownResource = function (resourceType, id, innerError) {
  var message = 'Unknown ' + (resourceType || 'resource') + ' ' + (id ? '"' + id + '"' : '');
  return new APIError(ErrorIds.UnknownResource, message, {
    httpStatus: 404,
    innerError: innerError
  });
};

factory.unsupportedContentType = function (contentType) {
  return new APIError(ErrorIds.UnsupportedContentType, 'We don\'t support "' + contentType +
      '" as content type. If you think we should, please help us and report an issue!',
      {httpStatus: 415});
};

factory.resultSizeExceeded = function (limit) {
  return new APIError(ErrorIds.resultSizeExceeded, 'limit of requested items exceeded, ' +
    'please use direct API call or page requests. Limit: ' + limit,
    {limit: limit, httpStatus: 413});
};