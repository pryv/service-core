/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('errors').factory;

/**
 * '404' handling to override Express' defaults. Must be set after the routes in the init sequence.
 */
module.exports = function notFound(req, res, next) {
  return next(errors.unknownResource());
};
