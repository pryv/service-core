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
const errors = require('components/errors').factory;
const _ = require('lodash');
const { Config, getConfig } = require('components/api-server/config/Config');

/**
 * Routes for users
 * @param app
 */
module.exports = function (expressApp: express$Application, app: Application) {

  const config: Config = getConfig();
  const api: API = app.api;
  const isSingleNode = config.get('singleNode:isActive');
  const isOpenSource = config.get('openSource:isActive');
  const context = {};
 
  // POST /users: create a new user
  expressApp.post('/users', function (req: express$Request, res: express$Response, next: express$NextFunction) {
    if (isSingleNode) {
      api.call('auth.register.singlenode', context, req.body, methodCallback(res, next, 201));
    } else {
      api.call('auth.register', context, req.body, methodCallback(res, next, 201));
    }
  });

  /**
   * POST /username/check_username: check the existence/validity of a given username
   */
  expressApp.get('/:username/check_username', (req: express$Request, res, next) => {
    if (isOpenSource) { // we will have to implement a singleNode version of this
      return next(errors.NonValidForOpenSource());
    } else {
      api.call('auth.usernameCheck', context, req.params, methodCallback(res, next, 200));
    }
  });

};