/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getAPIVersion } = require('middleware/src/project_version');
// Middleware to handle OPTIONS requests and to add CORS headers to all other
// requests.
module.exports = async function () {
  const version = await getAPIVersion();
  return function (req, res, next) {
    // allow cross-domain requests (CORS)
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    // *
    res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method'] ||
            'POST, GET, PUT, DELETE, OPTIONS');
    // *
    res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ||
            'Authorization, Content-Type');
    res.header('Access-Control-Expose-Headers', 'API-Version');
    // *
    res.header('Access-Control-Max-Age', (60 * 60 * 24 * 365).toString());
    res.header('Access-Control-Allow-Credentials', 'true');
    // keep API version in HTTP headers for now
    res.header('API-Version', version);
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  };
};
