// @flow

import type Application from '../application';

const errors = require('components/errors').factory;
const { contentType } = require('components/middleware');
const _ = require('lodash');
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');

// System (e.g. registration server) calls route handling.
module.exports = function system(expressApp: express$Application, app: Application) {
  const { systemAPI } = app;
  const { settings } = app;

  const adminAccessKey = settings.get('auth.adminAccessKey').str();

  const logger = app.logFactory('routes/system');

  /**
   * Handle common parameters.
   */
  expressApp.all(`${Paths.System}*`, checkAuth);

  expressApp.post(`${Paths.System}/create-user`, contentType.json, createUser);

  // DEPRECATED: remove after all reg servers updated
  expressApp.post('/register/create-user', contentType.json, createUser);

  function createUser(req: express$Request, res, next) {
    const params = _.extend({}, req.body);
    systemAPI.call('system.createUser', {}, params, methodCallback(res, next, 201));
  }

  // Specific routes for managing users pool
  expressApp.post(`${Paths.System}/pool/create-user`, contentType.json, createPoolUser);

  function createPoolUser(req: express$Request, res, next) {
    systemAPI.call('system.createPoolUser', {}, {}, methodCallback(res, next, 201));
  }

  expressApp.get(`${Paths.System}/pool/size`, (req: express$Request, res, next) => {
    systemAPI.call('system.getUsersPoolSize', {}, {}, methodCallback(res, next, 200));
  });

  expressApp.get(`${Paths.System}/user-info/:username`, (req: express$Request, res, next) => {
    const params = {
      username: req.params.username,
    };
    systemAPI.call('system.getUserInfo', {}, params, methodCallback(res, next, 200));
  });

  // Checks if `req` contains valid authorization to access the system routes.
  //
  function checkAuth(req: express$Request, res, next) {
    const secret = req.headers.authorization;

    if (secret == null || secret !== adminAccessKey) {
      logger.warn('Unauthorized attempt to access system route', {
        url: req.url,
        ip: req.ip,
        headers: req.headers,
        body: req.body,
      });

      // return "not found" to avoid encouraging retries
      return next(errors.unknownResource());
    }

    next();
  }
};
