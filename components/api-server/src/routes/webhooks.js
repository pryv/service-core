/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const _ = require('lodash');
const middleware = require('middleware');
const { setMethodId } = require('middleware');

const API = require('../API');
import type Application  from '../application';

/**
 * Webhooks route handling.
 *
 * @param {App} expressApp
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp: express$Application, app: Application) {

  const api: API = app.api;

  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.Webhooks, 
    loadAccessMiddleware,
    setMethodId('webhooks.get'),
    function (req: express$Request, res: express$Response, next: express$NextFunction) {
      req.context.params = req.query;
      api.call(req.context, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.Webhooks + '/:id', 
    loadAccessMiddleware,
    setMethodId('webhooks.getOne'),
    function (req: express$Request, res: express$Response, next: express$NextFunction) {
      req.context.params = _.extend({ id: req.params.id }, req.query);
      api.call(req.context, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Webhooks, 
    loadAccessMiddleware,
    setMethodId('webhooks.create'),
    function (req: express$Request, res: express$Response, next: express$NextFunction) {
      req.context.params = req.body;
      api.call(req.context, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Webhooks + '/:id', 
    loadAccessMiddleware,
    setMethodId('webhooks.update'),
    function (req: express$Request, res: express$Response, next: express$NextFunction) {
      req.context.params = { id: req.params.id, update: req.body };
      api.call(req.context, methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.Webhooks + '/:id', 
    loadAccessMiddleware,
    setMethodId('webhooks.delete'),
    function (req: express$Request, res: express$Response, next: express$NextFunction) {
      req.context.params = _.extend({ id: req.params.id }, req.query);
      api.call(req.context, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Webhooks + '/:id/test', 
    loadAccessMiddleware,
    setMethodId('webhooks.test'),
    function (req: express$Request, res: express$Response, next: express$NextFunction) {
      req.context.params = _.extend({ id: req.params.id }, req.query);
      api.call(req.context, methodCallback(res, next, 200));
  });
};
