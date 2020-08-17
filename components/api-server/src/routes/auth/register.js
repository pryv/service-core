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

/**
 * Routes for users
 * @param app
 */
module.exports = function (expressApp: express$Application, app: Application) {

  // const settings: ConfigAccess = app.settings;
  const api: API = app.api;
  const isSingleNode = app.settings.get('singleNode').obj().isActive;
  const isOpenSource = app.settings.get('openSource').obj().isActive;
  const context = {};
 
  // POST /user: create a new user
  expressApp.post('/user', function (req: express$Request, res: express$Response, next: express$NextFunction) {
   if (isSingleNode) {
      api.call('auth.register.singlenode', context, req.body, methodCallback(res, next, 201));
    }else{
      api.call('auth.register', context, req.body, methodCallback(res, next, 201));
    }
  });

  /**
   * POST /username/check: check the existence/validity of a given username
   */
  expressApp.post('/username/check', (req: express$Request, res, next) => {
    if (isOpenSource) {
      return next(errors.NonValidForOpenSource());
    }else{
      // return text response
      api.call('auth.usernameCheck', context, req.body, function (err, result) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        if (err) return res.status(200).end(String(false));
        let response = _.defaults(!result.reserved, false);
        res.status(200).end(String(response));
      });
    }
  });

  /**
   * GET /:username/check_username: check the existence/validity of a given username
   */
  expressApp.get('/:username/check_username', (req: express$Request, res, next) => {
    if (isOpenSource) {
      return next(errors.NonValidForOpenSource());
    }else{
      var params = {
        username: req.params.username
      };
      api.call('auth.usernameCheck', context, params, methodCallback(res, next, 200));
    }
  });

};