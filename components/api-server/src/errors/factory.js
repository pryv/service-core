/**
 * Helper "factory" methods for API errors (merge of API-server-specific and common methods).
 */

var errors = require('components/errors'),
    APIError = errors.APIError,
    ErrorIds = require('./ErrorIds'),
    _ = require('lodash');

_.extend(exports, errors.factory);

exports.invalidCredentials = function (message) {
  return new APIError(ErrorIds.InvalidCredentials,
      message || 'The given username/password pair is invalid.',
      {httpStatus: 401});
};

exports.invalidItemId = function (message) {
  return new APIError(ErrorIds.InvalidItemId, message, {httpStatus: 400});
};

exports.invalidMethod = function (methodId) {
  return new APIError(ErrorIds.InvalidMethod, 'Invalid method id "' + methodId + '"',
      {httpStatus: 404});
};

exports.invalidOperation = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidOperation, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

exports.invalidParametersFormat = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidParametersFormat, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

exports.invalidRequestStructure = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidRequestStructure, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

exports.itemAlreadyExists = function (resourceType, conflictingKeys, innerError) {
  resourceType = resourceType || 'resource';
  var article = _.contains(['a', 'e', 'i', 'o', 'u'], resourceType[0]) ? 'An ' : 'A ';
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

exports.periodsOverlap = function (message, data, innerError) {
  return new APIError(ErrorIds.PeriodsOverlap, message, {
    httpStatus: 400,
    data: data,
    innerError: innerError
  });
};

exports.unsupportedContentType = function (contentType) {
  return new APIError(ErrorIds.UnsupportedContentType, 'We don\'t support "' + contentType +
      '" as content type. If you think we should, please help us and report an issue!',
      {httpStatus: 415});
};
