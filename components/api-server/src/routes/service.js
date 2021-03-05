/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const express = require('express');
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');
const { setMethodId } = require('middleware');

import type Application  from '../application';

/**
 * Set up events route handling.
 */
module.exports = function(expressApp: express$Application, app: Application) {  
  const api = app.api;
  expressApp.get(Paths.Service + '/info', 
    setMethodId('service.info'),
    function (req: express$Request, res, next) {
      req.context.skipAudit = true;
      api.call(req.context, req.query, methodCallback(res, next, 200));
  });

  // Old route, we keep it for backward compatibility
  // but we should remove it
  expressApp.get(Paths.Service + '/infos',
    setMethodId('service.info'),
    function (req: express$Request, res, next) {
      req.context.skipAudit = true;
      api.call(req.context, req.query, methodCallback(res, next, 200));
  });
};
