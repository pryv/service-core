/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Just validates that the request is of one of the specified content types; otherwise returns a
 * 415 error.
 */

const errors = require('errors').factory;

/**
 * Accepts a variable number of content types as arguments.
 */
function checkContentType (/* arguments */) {
  const acceptedTypes = arguments;
  const count = acceptedTypes.length;
  return function (req, res, next) {
    if (count < 1) { return next(); }

    const contentType = req.headers['content-type'];
    if (!contentType) { return next(errors.missingHeader('Content-Type')); }

    for (let i = 0; i < count; i++) {
      if (req.is(acceptedTypes[i])) {
        return next();
      }
    }

    next(errors.unsupportedContentType(contentType));
  };
}

exports.json = checkContentType('application/json');
exports.jsonOrForm = checkContentType('application/json', 'application/x-www-form-urlencoded');
exports.multipartOrJson = checkContentType('multipart/form-data', 'application/json');
