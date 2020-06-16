// @flow

import type Application from '../application';

const _ = require('lodash');
const middleware = require('components/middleware');
const methodCallback = require('./methodCallback');
const Paths = require('./Paths');

// Shared accesses route handling.
module.exports = function (expressApp: express$Application, app: Application) {
  const { api } = app;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  // Require access for all Accesses API methods.
  expressApp.all(`${Paths.Accesses}*`, loadAccessMiddleware);

  expressApp.get(Paths.Accesses, (req: express$Request, res, next) => {
    api.call('accesses.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Accesses, (req: express$Request, res, next) => {
    api.call('accesses.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(`${Paths.Accesses}/:id`, (req: express$Request, res, next) => {
    const params = { id: req.params.id, update: req.body };
    api.call('accesses.update', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.delete(`${Paths.Accesses}/:id`, (req: express$Request, res, next) => {
    const params = _.extend({ id: req.params.id }, req.query);
    api.call('accesses.delete', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(`${Paths.Accesses}/check-app`, (req: express$Request, res, next) => {
    api.call('accesses.checkApp', req.context, req.body, methodCallback(res, next, 200));
  });
};
