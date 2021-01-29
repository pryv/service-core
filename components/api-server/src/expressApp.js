/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const express = require('express');
const _ = require('lodash');
const bodyParser = require('body-parser');

const middleware = require('middleware');

const Paths = require('./routes/Paths');

const { ProjectVersion } = require('middleware/src/project_version');

// ------------------------------------------------------------ express app init

// Creates and returns an express application with a standard set of middleware. 
// `version` should be the version string you want to show to API clients. 
// 
async function expressAppInit(isDnsLess: boolean, logging) {
  const pv = new ProjectVersion();
  const version = pv.version();
  var app = express(); // register common middleware
  const commonHeadersMiddleware = middleware.commonHeaders(version);
  const requestTraceMiddleware = middleware.requestTrace(app, logging);

  // register common middleware

  app.disable('x-powered-by');

  // Install middleware to hoist the username into the request path. 
  // 
  // NOTE Insert this bit in front of 'requestTraceMiddleware' to also see 
  //  username in logged paths. 
  // 
  const ignorePaths = _.chain(Paths)
    .filter(e => _.isString(e))
    .filter(e => e.indexOf(Paths.Params.Username) < 0)
    .value(); 

  if (!isDnsLess)
    app.use(middleware.subdomainToPath(ignorePaths));

  // Parse JSON bodies: 
  app.use(bodyParser.json({
    limit: '10mb'}));

  // This object will contain key-value pairs, where the value can be a string
  // or array (when extended is false), or any type (when extended is true).
  app.use(bodyParser.urlencoded({
    extended: false}));

  // Other middleware:
  app.use(requestTraceMiddleware);
  app.use(middleware.override);
  app.use(commonHeadersMiddleware);

  return app;
}

module.exports = expressAppInit;