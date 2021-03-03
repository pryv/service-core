/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/**
 * Sets the calledMethodId to the Request.context object of the Express stack
 */
module.exports = function setCalledMethodId(calledMethodId: string) {
  return function (
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    if (req.context == null) req.context = {};
    req.context.calledMethodId = calledMethodId;
    next();
  };
};
