/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Regroups acceptance tests reused in different places.
 */

const validation = require('./validation');
const ErrorIds = require('errors').ErrorIds;
const request = require('superagent');

/**
 * @param {String} serverURL
 * @param {String} path
 */
exports.checkAccessTokenAuthentication = function (serverURL, path, done) {
  request.get(new URL(path, serverURL).toString()).end(function (err, res) {
    validation.check(res, {
      status: 401,
      id: ErrorIds.InvalidAccessToken
    }, done);
  });
};
