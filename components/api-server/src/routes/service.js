// @flow

import type Application from '../application';

const express = require('express');
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');

/**
 * Set up events route handling.
 */
module.exports = function (expressApp: express$Application, app: Application) {
  const { api } = app;
  expressApp.get(`${Paths.Service}/info`, (req: express$Request, res, next) => {
    api.call('service.info', req.context, req.query, methodCallback(res, next, 200));
  });

  // Old route, we keep it for backward compatibility
  // but we should remove it
  expressApp.get(`${Paths.Service}/infos`, (req: express$Request, res, next) => {
    api.call('service.info', req.context, req.query, methodCallback(res, next, 200));
  });
};
module.exports.injectDependencies = true;
