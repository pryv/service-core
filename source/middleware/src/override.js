'use strict';
// @flow

var APIError = require('components/errors').APIError,
    ErrorIds = require('components/errors').ErrorIds;

/**
 * Middleware to allow overriding HTTP method, "Authorization" header and JSON
 * body content by sending them as fields in urlencoded requests. Does not
 * perform request body parsing (expects req.body to exist), so must be executed
 * after e.g. bodyParser middleware.
 */
module.exports = function (req: express$Request, res: express$Response, next: () => void) {
  if (! req.is('application/x-www-form-urlencoded')) { return next(); }
  
  const body = req.body; 
  if (body == null || typeof body !== 'object') return next();

  if (typeof body._method == 'string') {
    req.originalMethod = req.originalMethod || req.method;
    req.method = body._method.toUpperCase();
    delete body._method;
  }

  if (body._auth) {
    if (req.headers.authorization) {
      req.headers['original-authorization'] = req.headers.authorization;
    }
    req.headers.authorization = body._auth;
    delete body._auth;
  }

  if (typeof body._json === 'string') {
    req.originalBody = req.originalBody || body;
    try {
      req.body = JSON.parse(body._json);
    } catch (err) {
      return next(new APIError(ErrorIds.InvalidRequestStructure, err.message, {httpStatus: 400}));
    }
  }

  next();
};

