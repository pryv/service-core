// @flow

const express = require('express');
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');

import type Application from '../application';

/**
 * Set up events route handling.
 */
module.exports = function(expressApp: express$Application, app: Application) {  
  const api = app.api;
  expressApp.get(Paths.Service + '/infos', function (req: express$Request, res, next) {
    api.call('service.infos', req.context, req.query, methodCallback(res, next, 200));
  });
};
module.exports.injectDependencies = true;
