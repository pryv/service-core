var errors = require('components/errors').factory,
    path = require('path');

/**
 * Middleware to translate the subdomain (i.e. username) in requests (if any) into the URL path,
 * e.g. path "/streams" on host ignace.pryv.io becomes "/ignace/streams".
 * Accepts a list of paths to ignore (e.g. /register, /socket.io), and does not add the
 * username again if it is already present as the path root.
 *
 * TODO: this responsibility should be moved out to the reverse proxy (e.g. Nginx)
 *
 * @param {Array} ignoredPaths Paths for which no translation is needed
 * @return {Function}
 */
module.exports = function (ignoredPaths) {
  return function (req, res, next) {
    if (isIgnoredPath(req.url)) { return next(); }

    if (! req.headers.host) { return next(errors.missingHeader('Host')); }

    var hostChunks = req.headers.host.split('.');
    // check for subdomain, assuming we have structure '<subdomain>.<2nd level domain>.<tld>'
    if (hostChunks.length === 3 && /[a-zA-Z]/.test(hostChunks[0])) {
      var usernamePathRoot = '/' + hostChunks[0];
      // just make sure it's not already there
      if (! startsWith(req.url, usernamePathRoot)) {
        req.url = `${usernamePathRoot}${req.url}`;
      }
    }

    next();
  };

  function isIgnoredPath(url) {
    return ignoredPaths.some(function (ignoredPath) {
      return startsWith(url, ignoredPath);
    });
  }
};
module.exports.injectDependencies = true; // make it DI-friendly

function startsWith(string, start) {
  return string.length >= start.length && string.slice(0, start.length) === start;
}
