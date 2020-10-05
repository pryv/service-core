/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const express = require('express');
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');

import type Application from '../application';

module.exports = function(expressApp: express$Application, app: Application) {  
  const api = app.api;

  // singleNode compatible route
  expressApp.get('/reg/service/info', function (req: express$Request, res, next) {
    api.call('service.info.singlenode', req.context, req.query, methodCallback(res, next, 200));
  });
}