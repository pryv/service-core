var APIError = require('components/errors').APIError,
    ErrorIds = require('components/errors').ErrorIds;

/**
 * Middleware to allow overriding HTTP method, "Authorization" header and JSON body content
 * by sending them as fields in urlencoded requests.
 * Does not perform request body parsing (expects req.body to exist), so must be executed after
 * e.g. bodyParser middleware.
 */
module.exports = function (req, res, next) {
  if (! req.is('application/x-www-form-urlencoded')) { return next(); }

  if (req.body._method) {
    req.originalMethod = req.originalMethod || req.method;
    req.method = req.body._method.toUpperCase();
    delete req.body._method;
  }

  if (req.body._auth) {
    if (req.headers.authorization) {
      req.headers['original-authorization'] = req.headers.authorization;
    }
    req.headers.authorization = req.body._auth;
    delete req.body._auth;
  }

  if (req.body._json) {
    req.originalBody = req.originalBody || req.body;
    try {
      req.body = JSON.parse(req.body._json);
    } catch (err) {
      return next(new APIError(ErrorIds.InvalidRequestStructure, err.message, {httpStatus: 400}));
    }
  }

  next();
};

