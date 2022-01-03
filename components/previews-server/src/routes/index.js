/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = function index(expressApp) {

  expressApp.options('*', function (req, res /*, next*/) {
    // common headers (e.g. CORS) are handled in related middleware
    res.sendStatus(200);
  });

};
