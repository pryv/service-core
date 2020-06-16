// @flow

import type Application from '../application';

const _ = require('lodash');
const middleware = require('components/middleware');
const methodCallback = require('./methodCallback');
const Paths = require('./Paths');

// Profile route handling.
module.exports = function (expressApp: express$Application, app: Application) {
  const { api } = app;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  // Require access for all Profile API methods.
  expressApp.all(`${Paths.Profile}*`, loadAccessMiddleware);

  expressApp.get(`${Paths.Profile}/public`, (req: express$Request, res, next) => {
    api.call('profile.getPublic', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(`${Paths.Profile}/public`, update('public'));

  expressApp.get(`${Paths.Profile}/app`, (req: express$Request, res, next) => {
    api.call('profile.getApp', req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(`${Paths.Profile}/app`, (req: express$Request, res, next) => {
    const params = { update: req.body };
    api.call('profile.updateApp', req.context, params, methodCallback(res, next, 200));
  });

  expressApp.get(`${Paths.Profile}/private`, get('private'));
  expressApp.put(`${Paths.Profile}/private`, update('private'));

  function get(id) {
    return function (req: express$Request, res, next) {
      api.call('profile.get', req.context, _.extend(req.query, { id }),
        methodCallback(res, next, 200));
    };
  }

  function update(id) {
    return function (req: express$Request, res, next) {
      api.call('profile.update', req.context, { id, update: req.body },
        methodCallback(res, next, 200));
    };
  }
};
