/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
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
const { setMinimalMethodContext, setMethodId } = require('middleware');

import type { ContextSource } from 'business';

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
  expressApp.all(Paths.System + '/*', setMinimalMethodContext, checkAuth);


  expressApp.post(Paths.System + '/create-user', contentType.json,
    setMethodId('system.createUser'),
    createUser);

  // DEPRECATED: remove after all reg servers updated
  expressApp.post('/register/create-user', contentType.json, 
    setMinimalMethodContext,
    setMethodId('system.createUser'),
    createUser);

  function createUser(req: express$Request, res, next) {
    const params = _.extend({}, req.body); 
    systemAPI.call(req.context, params, methodCallback(res, next, 201));
  }

  expressApp.get(Paths.System + '/user-info/:username',
    setMethodId('system.getUserInfo'),
    function (req: express$Request, res, next) {
      const params = {
        username: req.params.username
      };
      systemAPI.call(req.context, params, methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.System + '/users/:username/mfa', 
    setMethodId('system.deactivateMfa'),
    function (req: express$Request, res, next) {
      systemAPI.call(req.context, { username: req.params.username }, methodCallback(res, next, 204));
  });

  // --------------------- health checks ----------------- //
  expressApp.get(Paths.System + '/check-platform-integrity',
    setMethodId('system.checkPlatformIntegrity'),
    function (req: express$Request, res, next) {
      systemAPI.call(req.context, {}, methodCallback(res, next, 200));
  }); 




  // Checks if `req` contains valid authorization to access the system routes. 
  // 
  function checkAuth(req: express$Request, res, next) {
    const secret = req.headers.authorization;
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

