// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const _ = require('lodash');
const middleware = require('components/middleware');

const API = require('../API');
import type Application from '../application';

/**
 * Webhooks route handling.
 *
 * @param {App} expressApp
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp: express$Application, app: Application) {

  const api: API = app.api;

  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  // Require access for all Webhooks API methods.
  expressApp.all(Paths.Webhooks + '*', loadAccessMiddleware);

  expressApp.get(Paths.Webhooks, function (req: express$Request, res: express$Response, next: express$NextFunction) {
    api.call('webhooks.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.Webhooks + '/:id', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    const params = _.extend({ id: req.params.id }, req.query);
    api.call('webhooks.getOne', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Webhooks, function (req: express$Request, res: express$Response, next: express$NextFunction) {
    api.call('webhooks.create', req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Webhooks + '/:id', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    const params = { id: req.params.id, update: req.body };
    api.call('webhooks.update', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.Webhooks + '/:id', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    const params = _.extend({ id: req.params.id }, req.query);
    api.call('webhooks.delete', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Webhooks + '/:id/test', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    const params = _.extend({ id: req.params.id }, req.query);
    api.call('webhooks.test', req.context, params, methodCallback(res, next, 200));
  });
};
