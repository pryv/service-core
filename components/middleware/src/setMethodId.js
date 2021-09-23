/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const { initRootSpan } = require('tracing');

/**
 * Sets the methodId to the Request.context object of the Express stack
 */
module.exports = function (methodId: string) {
  return function setMethodId(
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    if (req.context == null) {
      const tracing = initRootSpan('expressX');
      req.context = {  tracing:  tracing};
      res.on('finish', () => { tracing.finishSpan('expressX', 'e2:' + methodId)} )
    }
    req.context.methodId = methodId;
    
    next();
  };
};
