/**
 * Regroups acceptance tests reused in different places.
 */

const { ErrorIds } = require('components/errors');
const request = require('superagent');
const url = require('url');
const validation = require('./validation');

/**
 * @param {String} serverURL
 * @param {String} path
 */
exports.checkAccessTokenAuthentication = function (serverURL, path, done) {
  request.get(url.resolve(serverURL, path)).end((err, res) => {
    validation.check(res, {
      status: 401,
      id: ErrorIds.InvalidAccessToken,
    }, done);
  });
};
