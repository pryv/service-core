/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { initRootSpan } = require('tracing');
/**
 * Sets the methodId to the Request.context object of the Express stack
 */
module.exports = function (methodId) {
  return function setMethodId (req, res, next) {
    if (req.context == null) {
      const tracing = initRootSpan('express2');
      req.context = { tracing };
      res.on('finish', () => {
        tracing.finishSpan('express2', 'e2:' + methodId);
      });
    }
    req.context.methodId = methodId;
    next();
  };
};
