/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const _ = require('lodash');

import type ContextSource from 'business/src/MethodContext';
import type Tracing from 'business/src/MethodContext';

class MinimalMethodContext {
  source: ContextSource;
  user: ?User;
  username: ?String;
  access: ?Access;
  originalQuery: ?{};
  tracing: Tracing;

  constructor(req: express$Request) {
    this.source =  {
      name: 'http',
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
    }
    this.originalQuery = _.cloneDeep(req.query);
    if (this.originalQuery?.auth) delete this.originalQuery.auth;
    this.tracing = req.tracing;
  }
}

/**
 * Helper for express to set a Minimal Context, for methods that does use the standard MethodContext.
 * Note: will have no effect is a context already exists.
 */
function setMinimalMethodContext(req: express$Request, res: express$Response, next: express$NextFunction) {
  if (req.context) {
    return next(new Error('Context already set'));
  }
  req.context = new MinimalMethodContext(req);
  next();
}

module.exports = setMinimalMethodContext;