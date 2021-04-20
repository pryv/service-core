/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const errors = require('errors').factory;
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');
const contentType = require('middleware').contentType;
const _ = require('lodash');
const { getLogger } = require('@pryv/boiler');

import type Application  from '../application';

// System (e.g. registration server) calls route handling.
module.exports = function system(expressApp: express$Application, app: Application) {

  const systemAPI = app.systemAPI;
  const config = app.config;
  
  const adminAccessKey = config.get('auth:adminAccessKey');

  const logger = getLogger('routes:system');

  /**
   * Handle common parameters.
   */
  expressApp.all(Paths.System + '/*', checkAuth);
  

  expressApp.post(Paths.System + '/create-user', contentType.json, createUser);

  // DEPRECATED: remove after all reg servers updated
  expressApp.post('/register/create-user', contentType.json, createUser);

  function createUser(req: express$Request, res, next) {

    let params = _.extend({}, req.body); 
    systemAPI.call('system.createUser', {}, params, methodCallback(res, next, 201));
  }

  // Specific routes for managing users pool
  expressApp.post(Paths.System + '/pool/create-user', contentType.json, createPoolUser);

  function createPoolUser(req: express$Request, res, next) {
    systemAPI.call('system.createPoolUser', {}, {}, methodCallback(res, next, 201));
  }

  expressApp.get(Paths.System + '/pool/size', function (req: express$Request, res, next) {
    systemAPI.call('system.getUsersPoolSize', {}, {}, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.System + '/user-info/:username', function (req: express$Request, res, next) {
    var params = {
      username: req.params.username
    };
    systemAPI.call('system.getUserInfo', {}, params, methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.System + '/users/:username/mfa', function (req: express$Request, res, next) {
    systemAPI.call('system.deleteMfa', {}, { username: req.params.username }, methodCallback(res, next, 204));
  });

  // Checks if `req` contains valid authorization to access the system routes. 
  // 
  function checkAuth(req: express$Request, res, next) {
    var secret = req.headers.authorization;
    if (secret==null || secret !== adminAccessKey) {
      logger.warn('Unauthorized attempt to access system route', {
        url: req.url,
        ip: req.ip,
        headers: req.headers,
        body: req.body });
      
      // return "not found" to avoid encouraging retries
      return next(errors.unknownResource());
    }

    next();
  }
};

