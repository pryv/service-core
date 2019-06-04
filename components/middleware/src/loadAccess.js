// @flow

import type { StorageLayer } from 'components/storage';

// Returns a middleware function that initializes the method context into
// `req.context`. The context is initialized with the user (loaded from
// username) and the access token. the access itself is **not** loaded from
// token here as it may be modified in the course of method execution, for
// example when calling a batch of methods. it is the api methods'
// responsibility to load the access when needed. 
// 
module.exports = function loadAccess(storageLayer: StorageLayer) {
  return function (
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    req.context.retrieveExpandedAccess(storageLayer)
      .then(() => {
        if (req.context.access != null) {
          res.header('Pryv-Access-Id', req.context.access.id);
        }
        next();
      })
      .catch(next);
  };
};
