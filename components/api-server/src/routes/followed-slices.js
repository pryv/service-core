/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const _ = require('lodash');
const middleware = require('middleware');
const { setMethodId } = require('middleware');
// Followed slices route handling.
module.exports = function (expressApp, app) {
  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);
  expressApp.get(Paths.FollowedSlices, setMethodId('followedSlices.get'), loadAccessMiddleware, function (req, res, next) {
    api.call(req.context, req.query, methodCallback(res, next, 200));
  });
  expressApp.post(Paths.FollowedSlices, setMethodId('followedSlices.create'), loadAccessMiddleware, function (req, res, next) {
    api.call(req.context, req.body, methodCallback(res, next, 201));
  });
  expressApp.put(Paths.FollowedSlices + '/:id', setMethodId('followedSlices.update'), loadAccessMiddleware, function (req, res, next) {
    api.call(req.context, { id: req.params.id, update: req.body }, methodCallback(res, next, 200));
  });
  expressApp.delete(Paths.FollowedSlices + '/:id', setMethodId('followedSlices.delete'), loadAccessMiddleware, function (req, res, next) {
    api.call(req.context, _.extend({ id: req.params.id }, req.query), methodCallback(res, next, 200));
  });
};
