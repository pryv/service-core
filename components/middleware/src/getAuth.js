// @flow

const ApiConstants = require('components/hfs-server/src/web/api_constants');

// Middleware that verifies the presence of an authorization token
// 
module.exports = (req: express$Request, res: express$Response, next: express$NextFunction) => {
  let authHeader = req.headers[ApiConstants.AUTH_HEADER];
  const authQuery = req.query.auth;

  if ((authHeader == null || authHeader === '') && (authQuery == null || authQuery === '')) {
    // return next(new Error('Missing \'Authorization\' header or \'auth\' query parameter.'));
    return next();
  }

  // Basic auth support
  // See service-core/components/middleware/src/initContext.js for reference
  if (authHeader != null) {
    const authBasic = authHeader.split(' ');
    if (authBasic[0].toLowerCase() === 'basic' && authBasic[1] != null) {
      // Note: since our Basic scheme do not contain the username, the token is in first position
      // example: https://token@username.pryv.me/
      authHeader = Buffer.from(authBasic[1], 'base64').toString('ascii').split(':')[0];
    }
  }

  // Set authorization token in the context
  const auth = authHeader || authQuery;
  req.headers[ApiConstants.AUTH_HEADER] = auth; // It's where hfs-server look for authorization token
  next();
};
