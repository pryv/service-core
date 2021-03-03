/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const methodCallback = require('./methodCallback');
const Paths = require('./Paths');
const _ = require('lodash');
const middleware = require('middleware');
const { setCalledMethodId } = require('middleware');

import type Application  from '../application';

// Shared accesses route handling.
module.exports = function (expressApp: express$Application, app: Application) {

  const api = app.api;
  const loadAccessMiddleware = middleware.loadAccess(app.storageLayer);

  expressApp.get(Paths.Accesses, 
    setCalledMethodId('accesses.get'), // put it in context.calledMethodId (see API.js)
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, req.query, methodCallback(res, next, 200));
  });

  expressApp.post(Paths.Accesses, 
    setCalledMethodId('accesses.create'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, req.body, methodCallback(res, next, 201));
  });

  expressApp.put(Paths.Accesses + '/:id', 
    setCalledMethodId('accesses.update'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      var params = { id: req.params.id, update: req.body };
      api.call(req.context, params, methodCallback(res, next, 200));
  });

  expressApp.delete(Paths.Accesses + '/:id',
    setCalledMethodId('accesses.delete'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      var params = _.extend({id: req.params.id}, req.query);
      api.call(req.context, params, methodCallback(res, next, 200));
  });
  
  expressApp.post(Paths.Accesses + '/check-app',
    setCalledMethodId('accesses.checkApp'),
    loadAccessMiddleware,
    function (req: express$Request, res, next) {
      api.call(req.context, req.body, methodCallback(res, next, 200));
  });

};
