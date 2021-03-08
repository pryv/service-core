import type ContextSource from 'model/src/MethodContext';

class MinimalMethodContext {
  source: ContextSource;
  user: ?User;
  access: ?Access;
  skipAudit: ?boolean;

  constructor(req: express$Request) {
    this.source =  {
      name: 'http',
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
    }
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