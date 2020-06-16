// @flow

import type Application from '../application';

const _ = require('lodash');
const middleware = require('components/middleware');
const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const { tryCoerceStringValues } = require('../schema/validation');

// Event streams route handling.
module.exports = function (expressApp: express$Application, app: Application) {
  const { api } = app;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  // Require access for all Streams API methods.
  expressApp.all(`${Paths.Streams}*`, loadAccessMiddleware);

  expressApp.get(Paths.Streams, (req: express$Request, res, next) => {
    const params = _.extend({}, req.query);
    tryCoerceStringValues(params, {
      includeDeletionsSince: 'number',
    });
    api.call('streams.get', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Streams, (req: express$Request, res, next) => {
    api.call('streams.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(`${Paths.Streams}/:id`, (req: express$Request, res, next) => {
    api.call('streams.update', req.context, { id: req.params.id, update: req.body },
      methodCallback(res, next, 200));
  });

  expressApp.delete(`${Paths.Streams}/:id`, (req: express$Request, res, next) => {
    const params = _.extend({ id: req.params.id }, req.query);
    tryCoerceStringValues(params, {
      mergeEventsWithParent: 'boolean',
    });
    api.call('streams.delete', req.context, params,
      methodCallback(res, next, 200));
  });
};
