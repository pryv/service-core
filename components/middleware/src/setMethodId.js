/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const ah = require('api-server/src/hooks');

/**
 * Sets the methodId to the Request.context object of the Express stack
 */
module.exports = function (methodId: string) {
  return function setMethodId(
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    if (req.context == null) req.context = {};

    // add methodId to request Context;
    const requestContext = ah.getRequestContext();
    if (requestContext == null) {
      console.log('Null request context', methodId);
    } else {
      requestContext.data.methodId = methodId;
    }

    req.context.methodId = methodId;
    next();
  };
};
