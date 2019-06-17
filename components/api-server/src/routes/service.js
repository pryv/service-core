const express = require('express');
const Paths = require('./Paths');
/**
 * Set up events route handling.
 */
module.exports = function(expressApp, api) {  
  expressApp.get(Paths.Service + '/infos', function (req, res, next) {
    api.call('service.infos', req.context, req.query, methodCallback(res, next, 200));
  });
};
//module.exports.injectDependencies = true;
