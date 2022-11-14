/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const express = require('express');
const Paths = require('./Paths');
const methodCallback = require('./methodCallback');
const { setMethodId } = require('middleware');


module.exports = function(expressApp, app) {  
  const api = app.api;

  // dnsLess compatible route
  expressApp.get('/reg/service/info', 
    setMethodId('service.info'),
    function (req, res, next) {
      api.call(req.context, req.query, methodCallback(res, next, 200));
  });
}