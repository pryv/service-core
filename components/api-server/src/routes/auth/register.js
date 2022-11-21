/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const methodCallback = require('../methodCallback');
const API = require('../../API');
const _ = require('lodash');
const { getConfigUnsafe } = require('@pryv/boiler');
const regPath = require('../Paths').Register;
const errors = require('errors').factory;
const { setMinimalMethodContext, setMethodId } = require('middleware');
/**
 * Routes for users
 * @param app
 */
module.exports = function (expressApp, app) {
  const api = app.api;
  const isDnsLess = getConfigUnsafe().get('dnsLess:isActive');
  // POST /users: create a new user
  expressApp.post('/users', setMinimalMethodContext, setMethodId('auth.register'), function (req, res, next) {
    req.context.host = req.headers.host;
    api.call(req.context, req.body, methodCallback(res, next, 201));
  });
  if (isDnsLess) {
    expressApp.post(path.join(regPath, '/user'), setMinimalMethodContext, setMethodId('auth.register'), function (req, res, next) {
      req.context.host = req.headers.host;
      if (req.body) { req.body.appId = req.body.appid; }
      api.call(req.context, req.body, methodCallback(res, next, 201));
    });
    expressApp.get(path.join(regPath, '/:username/check_username'), setMinimalMethodContext, setMethodId('auth.usernameCheck'), (req, res, next) => {
      api.call(req.context, req.params, methodCallback(res, next, 200));
    });
    expressApp.get(path.join(regPath, '/:email/check_email'), setMinimalMethodContext, setMethodId('auth.emailCheck'), (req, res, next) => {
      api.call(req.context, req.params, methodCallback(res, next, 200));
    });
    expressApp.post(path.join(regPath, '/username/check'), (req, res, next) => {
      next(errors.goneResource());
    });
    expressApp.post(path.join(regPath, '/email/check'), (req, res, next) => {
      next(errors.goneResource());
    });
  }
};
