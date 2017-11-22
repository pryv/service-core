/**
 * Regroups acceptance tests reused in different places.
 */

var validation = require('./validation'),
    ErrorIds = require('components/errors').ErrorIds,
    request = require('superagent'),
    url = require('url');

/**
 * @param {String} serverURL
 * @param {String} path
 */
exports.checkAccessTokenAuthentication = function (serverURL, path, done) {
  request.get(url.resolve(serverURL, path)).end(function (err, res) {
    validation.check(res, {
      status: 401,
      id: ErrorIds.InvalidAccessToken
    }, done);
  });
};
