/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const express = require('express');
const _ = require('lodash');
const bodyParser = require('body-parser');

const middleware = require('middleware');

const Paths = require('./routes/Paths');

const { getAPIVersion } = require('middleware/src/project_version');

const { getConfig } = require('@pryv/boiler');

// ------------------------------------------------------------ express app init

// Creates and returns an express application with a standard set of middleware. 
// `version` should be the version string you want to show to API clients. 
// 
async function expressAppInit(logging) {
  const version = await getAPIVersion();
  const config = await getConfig();
  const app = express(); // register common middleware

  patchApp(app);


  const commonHeadersMiddleware = await middleware.commonHeaders();
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

  if (!config.get('dnsLess:isActive'))
    app.use(middleware.subdomainToPath(ignorePaths));

  // Parse JSON bodies: 
  app.use(bodyParser.json({
    limit: config.get('uploads:maxSizeMb') + 'mb'}));

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

function patchApp(app) {
  app.unpatchedUse = app.use;
  app.use = function() {
    const newArgs = [];
    for (let i = 0; i < arguments.length; i++) {
      newArgs.push(patchFunction(arguments[i]));
    }
    console.log(arguments, newArgs);
    return app.unpatchedUse.apply(app, newArgs);
  }

}

function patchFunction(fn) {
  // return fn; 
  if (fn.constructor.name === 'AsyncFunction') {
    return async function() { return await fn.apply(this, arguments); }
  } 
  return function() { return fn.apply(this, arguments); }
}

function patchFunction2(fn) {
  // return fn; 
  if (fn.constructor.name === 'AsyncFunction') {
    return async function(req, res, next) { return await fn(req, res, next); }
  } 
  return function(req, res, next) { return fn(req, res, next); }
}



module.exports = expressAppInit;