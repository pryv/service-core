/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const _ = require('lodash');
const middleware = require('middleware');
const { setMethodId } = require('middleware');

import type Application  from '../application';

// Profile route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.Profile + '/public', 
    setMethodId('profile.getPublic'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Profile + '/public',
    setMethodId('profile.update'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, { id: 'public', update: req.body }, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.Profile + '/app', 
    setMethodId('profile.getApp'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Profile + '/app', 
    setMethodId('profile.updateApp'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      const params = {update: req.body};
      api.call(req.context, params, methodCallback(res, next, 200));
  });

  expressApp.get(Paths.Profile + '/private',
    setMethodId('profile.get'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
    api.call(req.context, _.extend(req.query, {id: 'private'}), methodCallback(res, next, 200));
  });

  expressApp.put(Paths.Profile + '/private', 
    setMethodId('profile.update'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, { id: 'private', update: req.body }, methodCallback(res, next, 200));
  });

};
