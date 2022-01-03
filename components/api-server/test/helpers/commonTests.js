/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Regroups acceptance tests reused in different places.
 */

var validation = require('./validation'),
    ErrorIds = require('errors').ErrorIds,
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
