var APIError = require('./APIError'),
    ErrorIds = require('./ErrorIds'),
    _ = require('lodash');

/**
 * Helper "factory" methods for API errors (see error ids).
 */
var factory = module.exports = {};

factory.corruptedData = function (message, innerError) { //
  return new APIError(ErrorIds.CorruptedData, message, {
    httpStatus: 422,
    innerError: innerError
  });
};

factory.forbidden = function (message, options) {
  if (! message) {
    message = 'The given token\'s access permissions do not allow this operation.';
  }
  return new APIError(ErrorIds.Forbidden, message, _.merge({httpStatus: 403}, options));
};

factory.invalidAccessToken = function (message, innerError, options) {
  return new APIError(ErrorIds.InvalidAccessToken, message, _.merge({
    httpStatus: 401,
    innerError: innerError
  }, options));
};

factory.invalidCredentials = function (message, options) {
  return new APIError(ErrorIds.InvalidCredentials,
    message || 'The given username/password pair is invalid.',
    _.merge({httpStatus: 401}, options));
};

factory.invalidItemId = function (message, options) {
  return new APIError(ErrorIds.InvalidItemId, message,
    _.merge({httpStatus: 400}, options));
};

factory.invalidMethod = function (methodId) {
  return new APIError(ErrorIds.InvalidMethod, 'Invalid method id "' + methodId + '"',
      {httpStatus: 404});
};

factory.invalidOperation = function (message, data, innerError, options) {
  return new APIError(ErrorIds.InvalidOperation, message, _.merge({
    httpStatus: 400,
    data: data,
    innerError: innerError
  }, options));
};

factory.invalidParametersFormat = function (message, data, innerError, options) {
  return new APIError(ErrorIds.InvalidParametersFormat, message, _.merge({
    httpStatus: 400,
    data: data,
    innerError: innerError
  }, options));
};

factory.invalidRequestStructure = function (message, data, innerError, options) {
  return new APIError(ErrorIds.InvalidRequestStructure, message, _.merge({
    httpStatus: 400,
    data: data,
    innerError: innerError
  }, options));
};

factory.itemAlreadyExists = function (resourceType, conflictingKeys, innerError, options) {
  resourceType = resourceType || 'resource';
  var article = _.includes(['a', 'e', 'i', 'o', 'u'], resourceType[0]) ? 'An ' : 'A ';
  var keysDescription = Object.keys(conflictingKeys).map(function (k) {
    return k + ' "' + conflictingKeys[k] + '"';
  }).join(', ');
  var message = article + resourceType + ' with ' + keysDescription +
      ' already exists';
  return new APIError(ErrorIds.ItemAlreadyExists, message, _.merge({
    httpStatus: 400,
    innerError: innerError,
    data: conflictingKeys
  }, options));
};

factory.missingHeader = function (headerName) {
  return new APIError(ErrorIds.MissingHeader, 'Missing expected header "' + headerName + '"',
      {httpStatus: 400});
};

factory.periodsOverlap = function (message, data, innerError, options) {
  return new APIError(ErrorIds.PeriodsOverlap, message, _.merge({
    httpStatus: 400,
    data: data,
    innerError: innerError
  }, options));
};

factory.tooManyResults = function (limit) {
  return new APIError(ErrorIds.tooManyResults,
    'Your request gave too many results (the limit is ' + limit + '. Directly calling ' +
    'the API method (i.e. not batching calls), narrowing request scope or paging can help.',
    {limit: limit, httpStatus: 413});
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
factory.unknownReferencedResource = function (resourceType, paramKey, value, innerError, options) {
  var message = 'Unknown referenced ' + (resourceType || 'resource(s)') + ' "' +
      (value.join ? value.join('", "') : value) + '"';
  var data = {};
  data[paramKey] = value;
  return new APIError(ErrorIds.UnknownReferencedResource, message, _.merge({
    httpStatus: 400,
    data: data,
    innerError: innerError
  }, options));
};

factory.unknownResource = function (resourceType, id, innerError, options) {
  var message = 'Unknown ' + (resourceType || 'resource') + ' ' + (id ? '"' + id + '"' : '');
  return new APIError(ErrorIds.UnknownResource, message, _.merge({
    httpStatus: 404,
    innerError: innerError
  }, options));
};

factory.unsupportedContentType = function (contentType) {
  return new APIError(ErrorIds.UnsupportedContentType, 'We don\'t support "' + contentType +
      '" as content type. If you think we should, please help us and report an issue!',
      {httpStatus: 415});
};