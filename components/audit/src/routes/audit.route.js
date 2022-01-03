/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');

const Result = require('api-server/src/Result');
const methodCallback = require('api-server/src/routes/methodCallback');
const Paths = require('api-server/src/routes/Paths');
const middleware = require('middleware');
const { setMethodId } = require('middleware');
const tryCoerceStringValues = require('api-server/src/schema/validation').tryCoerceStringValues;

import type Application  from 'api-server/src/application';

// Event streams route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);
  
  expressApp.get(Paths.Audit, 
    setMethodId('audit.getLogs'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      const params = _.extend({}, req.query);
      tryCoerceStringValues(params, { // standard event type
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



