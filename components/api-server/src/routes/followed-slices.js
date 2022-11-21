/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
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

// Followed slices route handling.
module.exports = function (expressApp: express$Application, app: Application) {
  
  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.FollowedSlices, 
    setMethodId('followedSlices.get'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
    api.call(req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.FollowedSlices,
    setMethodId('followedSlices.create'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
    api.call(req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.FollowedSlices + '/:id', 
    setMethodId('followedSlices.update'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
    api.call(req.context, { id: req.params.id, update: req.body }, methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.FollowedSlices + '/:id', 
    setMethodId('followedSlices.delete'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
    api.call(req.context, _.extend({ id: req.params.id }, req.query), methodCallback(res, next, 200));
  });

};
