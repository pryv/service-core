/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// Middleware that verifies the presence of an authorization token
//
module.exports = (req, res, next) => {
  req.headers.authorization = getAuth(req);
  next();
};
/**
 * @returns {string}
 */
function getAuth (req) {
  let authorizationHeader = req.header('authorization');
  if (authorizationHeader != null) {
    const basic = authorizationHeader.split(' ');
    if (basic[0].toLowerCase() === 'basic' && basic[1]) {
      authorizationHeader = Buffer.from(basic[1], 'base64')
        .toString('ascii')
        .split(':')[0];
    }
    if (Array.isArray(authorizationHeader)) { return authorizationHeader[0]; }
    return authorizationHeader;
  }
  // assert: no authorization in header, let's check query:
  const authFromQuery = req.query.auth;
  if (authFromQuery == null) { return null; }
  if (Array.isArray(authFromQuery)) { return authFromQuery[0]; }
  return authFromQuery;
}
