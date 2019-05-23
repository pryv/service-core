// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const _ = require('lodash');

const API = require('../API');

/**
 * Webhooks route handling.
 *
 * @param {App} expressApp
 * @param {Object} api The API object for registering methods
 */
module.exports = function (expressApp: express$Application, api: API) {

  expressApp.get(Paths.Webhooks, function (req: express$Request, res: express$Response, next: express$NextFunction) {
    api.call('webhooks.get', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.Webhooks + '/:id', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    api.call('webhooks.getOne', req.context, req.query, methodCallback(res, next, 200));
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
};
module.exports.injectDependencies = true;
