/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const APIError = require('./APIError');
const ErrorIds = require('./ErrorIds');
const ErrorMessages = require('./ErrorMessages');
const _ = require('lodash');

/**
 * Helper "factory" methods for API errors (see error ids).
 */
const factory = (module.exports = {});

factory.unsupportedOperation = (message) => {
  return new APIError(ErrorIds.ApiUnavailable, message, {
    httpStatus: 501
  });
};

factory.apiUnavailable = (message) => {
  return new APIError(ErrorIds.ApiUnavailable, message, {
    httpStatus: 503
  });
};

factory.corruptedData = function (message, innerError) {
  return new APIError(ErrorIds.CorruptedData, message, {
    httpStatus: 422,
    innerError
  });
};

factory.forbidden = function (message) {
  if (message == null) {
    message =
            "The given token's access permissions do not allow this operation.";
  }
  return new APIError(ErrorIds.Forbidden, message, {
    httpStatus: 403,
    dontNotifyAirbrake: true
  });
};

factory.invalidAccessToken = function (message, status) {
  return new APIError(ErrorIds.InvalidAccessToken, message, {
    httpStatus: status || 401,
    dontNotifyAirbrake: true
  });
};

factory.invalidCredentials = function (message) {
  return new APIError(ErrorIds.InvalidCredentials, message || 'The given username/password pair is invalid.', {
    httpStatus: 401,
    dontNotifyAirbrake: true
  });
};

factory.invalidEventType = function (type) {
  return new APIError(ErrorIds.InvalidEventType, "Event type '" +
        type +
        "' not allowed " +
        'for High-Frequency Series. Please use a predefined simple type', { type, httpStatus: 400 });
};

factory.invalidItemId = function (message) {
  return new APIError(ErrorIds.InvalidItemId, message || '', {
    httpStatus: 400,
    dontNotifyAirbrake: true
  });
};

factory.invalidMethod = function (methodId) {
  return new APIError(ErrorIds.InvalidMethod, 'Invalid method id "' + methodId + '"', { httpStatus: 404 });
};

factory.invalidOperation = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidOperation, message, {
    httpStatus: 400,
    data,
    innerError,
    dontNotifyAirbrake: true
  });
};

factory.invalidParametersFormat = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidParametersFormat, message, {
    httpStatus: 400,
    data,
    innerError,
    dontNotifyAirbrake: true
  });
};

factory.invalidRequestStructure = function (message, data, innerError) {
  return new APIError(ErrorIds.InvalidRequestStructure, message, {
    httpStatus: 400,
    data,
    innerError,
    dontNotifyAirbrake: true
  });
};

factory.itemAlreadyExists = function (resourceType, conflictingKeys, innerError) {
  resourceType = resourceType || 'resource';
  const keysDescription = Object.keys(conflictingKeys)
    .map(function (k) {
      return k + ' "' + conflictingKeys[k] + '"';
    })
    .join(', ');
  const message = functionGetRightArticle(resourceType) +
        resourceType +
        ' with ' +
        keysDescription +
        ' already exists';
  return new APIError(ErrorIds.ItemAlreadyExists, message, {
    httpStatus: 409,
    innerError: innerError || null,
    data: conflictingKeys,
    dontNotifyAirbrake: true
  });
};

factory.missingHeader = function (headerName, status) {
  return new APIError(ErrorIds.MissingHeader, 'Missing expected header "' + headerName + '"', {
    httpStatus: status || 400,
    dontNotifyAirbrake: true
  });
};

/**
 * Strange, but seems to be used only in tests
 * @param {*} message
 * @param {*} data
 * @param {*} innerError
 */
factory.periodsOverlap = function (message, data, innerError) {
  return new APIError(ErrorIds.PeriodsOverlap, message, {
    httpStatus: 400,
    data,
    innerError,
    dontNotifyAirbrake: true
  });
};

factory.tooManyResults = function (limit) {
  return new APIError(ErrorIds.TooManyResults, 'Your request gave too many results (the limit is ' +
        limit +
        '. Directly calling ' +
        'the API method (i.e. not batching calls), narrowing request scope or paging can help.', { limit, httpStatus: 413 });
};

factory.unexpectedError = function (sourceError, message) {
  // If a message was given: display it.
  if (message != null) { return produceError(message); }
  // Sometimes people throw strings
  if (typeof sourceError === 'string') { return produceError(sourceError); }
  // Maybe this looks like an Error?
  const error = sourceError;
  if (error != null && error instanceof Error && error.message != null) {
    // NOTE Could not get this path covered with type information. It looks sound...
    return produceError(error.message, error);
  }
  // Give up:
  return produceError('(no message given)');
  function produceError (msg, error) {
    const opts = {
      httpStatus: 500,
      innerError: error
    };
    const text = `${ErrorMessages[ErrorIds.UnexpectedError]}: ${msg}`;
    return new APIError(ErrorIds.UnexpectedError, text, opts);
  }
};

factory.unknownReferencedResource = function (resourceType, paramKey, value, innerError) {
  const joinedVals = typeof value === 'string' ? value : value.join('", "');
  const resourceTypeText = resourceType || 'resource(s)';
  const message = `Unknown referenced ${resourceTypeText} "${joinedVals}"`;
  const data = {};
  data[paramKey] = value;
  return new APIError(ErrorIds.UnknownReferencedResource, message, {
    httpStatus: 400,
    data,
    innerError,
    dontNotifyAirbrake: true
  });
};

factory.unknownResource = function (resourceType, id, innerError) {
  const message = 'Unknown ' +
        (resourceType || 'resource') +
        ' ' +
        (id ? '"' + id + '"' : '');
  return new APIError(ErrorIds.UnknownResource, message, {
    httpStatus: 404,
    innerError,
    dontNotifyAirbrake: true
  });
};

factory.unsupportedContentType = function (contentType) {
  return new APIError(ErrorIds.UnsupportedContentType, `If you think we should, please help us and report an issue! (You used ${contentType})`, { httpStatus: 415 });
};

factory.goneResource = function () {
  return new APIError(ErrorIds.Gone, 'API method gone, please stop using it.', {
    httpStatus: 410,
    dontNotifyAirbrake: true
  });
};

factory.unavailableMethod = function (message) {
  return new APIError(ErrorIds.unavailableMethod, 'API method unavailable in current version. This method is only available in the commercial license.', {
    httpStatus: 451,
    dontNotifyAirbrake: true
  });
};

/**
 * Check in service-register if email is used
 * The name is used in the service-core and service-register
 **/
factory.InvalidInvitationToken = () => {
  const opts = {
    httpStatus: 400,
    data: { param: 'invitationToken' }
  };
  return new APIError(ErrorIds.InvalidInvitationToken, ErrorMessages[ErrorIds.InvalidInvitationToken], opts);
};

/**
 * Get the right article for the noun
 * @param {*} noun
 * @returns {"An " | "A "}
 */
function functionGetRightArticle (noun) {
  return _.includes(['a', 'e', 'i', 'o', 'u'], noun[0].toLowerCase())
    ? 'An '
    : 'A ';
}
