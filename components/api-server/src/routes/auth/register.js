/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('../methodCallback');
const API = require('../../API');
import type Application from '../../application';
const _ = require('lodash');
const { gifnoc } = require('boiler');

/**
 * Routes for users
 * @param app
 */
module.exports = function (expressApp: express$Application, app: Application) {

  const api: API = app.api;
  const isDnsLess = gifnoc.get('dnsLess:isActive');

  // POST /users: create a new user
  expressApp.post('/users', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    let context = { host: req.headers.host };
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

};