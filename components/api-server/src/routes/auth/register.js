/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const path = require('path');
const methodCallback = require('../methodCallback');
const API = require('../../API');
import type Application  from '../../application';
const _ = require('lodash');
const { getConfigUnsafe } = require('boiler');
const regPath = require('../Paths').Register;
const errors = require('errors').factory;

/**
 * Routes for users
 * @param app
 */
module.exports = function (expressApp: express$Application, app: Application) {

  const api: API = app.api;
  const isDnsLess = getConfigUnsafe().get('dnsLess:isActive');
  const isOpenSource = getConfigUnsafe().get('openSource:isActive');

  // POST /users: create a new user
  expressApp.post('/users', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    const context = { host: req.headers.host };
    if (isDnsLess) {
      api.call('auth.register.dnsless', context, req.body, methodCallback(res, next, 201));
    } else {
      api.call('auth.register', context, req.body, methodCallback(res, next, 201));
    }
  });

  /**
   * POST /username/check_username: check the existence/validity of a given username
   */
  expressApp.get('/:username/check_username', (req: express$Request, res, next) => {
    if (isDnsLess) {
      api.call('auth.usernameCheck.dnsless', {}, req.params, methodCallback(res, next, 200));
    } else {
      api.call('auth.usernameCheck', {}, req.params, methodCallback(res, next, 200));
    }
  });
  
  if (isOpenSource) {    
    expressApp.post(path.join(regPath, '/user'), function (req: express$Request, res: express$Response, next: express$NextFunction) {
      const context = { host: req.headers.host };
      if (req.body) req.body.appId = req.body.appid;
      api.call('auth.register.dnsless', context, req.body, methodCallback(res, next, 201));
    });
    expressApp.get(path.join(regPath, '/:username/check_username'), (req: express$Request, res, next) => {
      api.call('auth.usernameCheck.dnsless', {}, req.params, methodCallback(res, next, 200));
    });
    expressApp.get(path.join(regPath, '/:email/check_email'), (req: express$Request, res, next) => {
      api.call('auth.emailCheck.dnsless', {}, req.params, methodCallback(res, next, 200));
    });
    expressApp.post(path.join(regPath, '/username/check'), (req: express$Request, res, next) => {
      next(errors.goneResource());
    });
    expressApp.post(path.join(regPath, '/email/check'), (req: express$Request, res, next) => {
      next(errors.goneResource());
    });
  }

};