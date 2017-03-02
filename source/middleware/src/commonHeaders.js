/**
 * Tiny middleware to write headers common to all requests.
 */

/**
 * @param serverInfo Must contain `version`
 * @return {Function}
 */
module.exports = function (serverInfo) {
  return function (req, res, next) {
    // allow cross-domain requests (CORS)
    // TODO: those marked with * should only be necessary in preflight requests (OPTIONS)
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    // *
    res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method'] ||
        'POST, GET, PUT, DELETE, OPTIONS');
    // *
    res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ||
        'Authorization, Content-Type');
    res.header('Access-Control-Expose-Headers', 'API-Version');
    // *
    res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
    res.header('Access-Control-Allow-Credentials', 'true');

    // keep API version in HTTP headers for now
    res.header('API-Version', serverInfo.version);

    next();
  };
};
module.exports.injectDependencies = true; // make it DI-friendly
