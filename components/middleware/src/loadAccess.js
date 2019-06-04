// @flow

import type { StorageLayer } from 'components/storage';

// Returns a middleware function that loads the access into `req.context.access`.
// The access is loaded from the token previously extracted by the `initContext` middleware.
// Also, it adds the corresponding access id as a specific response header.
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
