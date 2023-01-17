/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _ = require('lodash');
const methodCallback = require('api-server/src/routes/methodCallback');
const Paths = require('api-server/src/routes/Paths');
const middleware = require('middleware');
const { setMethodId } = require('middleware');
const tryCoerceStringValues = require('api-server/src/schema/validation').tryCoerceStringValues;
// Event streams route handling.
module.exports = function (expressApp, app) {
  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);
  expressApp.get(Paths.Audit, setMethodId('audit.getLogs'), loadAccessMiddleware, function (req, res, next) {
    const params = _.extend({}, req.query);
    tryCoerceStringValues(params, {
      // standard event type
      fromTime: 'number',
      toTime: 'number',
      streams: 'object',
      types: 'array',
      sortAscending: 'boolean',
      skip: 'number',
      limit: 'number',
      modifiedSince: 'number'
    });
    api.call(req.context, params, methodCallback(res, next, 200));
  });
};
