/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const tryCoerceStringValues = require('../schema/validation').tryCoerceStringValues;
const _ = require('lodash');
const middleware = require('middleware');
const { setMethodId } = require('middleware');

import type Application  from '../application';

// Event streams route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.Streams, 
    loadAccessMiddleware,
    setMethodId('streams.get'),
    function (req: express$Request, res, next) {
      const params = _.extend({}, req.query);
      tryCoerceStringValues(params, {
        includeDeletionsSince: 'number'
      });
      api.call(req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Streams, 
    loadAccessMiddleware,
    setMethodId('streams.create'),
    function (req: express$Request, res, next) {
      api.call(req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Streams + '/:id', 
    loadAccessMiddleware,
    setMethodId('streams.update'),
    function (req: express$Request, res, next) {
      api.call(req.context, { id: req.params.id, update: req.body },
        methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.Streams + '/:id',
    loadAccessMiddleware,
    setMethodId('streams.delete'),
    function (req: express$Request, res, next) {
      const params = _.extend({id: req.params.id}, req.query);
      tryCoerceStringValues(params, {
        mergeEventsWithParent: 'boolean'
      });
      api.call(req.context, params, methodCallback(res, next, 200));
  });

};
