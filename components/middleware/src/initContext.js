// @flow

const model = require('components/model');
const MethodContext = model.MethodContext;

import type { CustomAuthFunction } from 'components/model';
import type { StorageLayer } from 'components/storage';

/**
 * Returns a middleware function that initializes the method context into `req.context`.
 * The context is initialized with the user (loaded from username) and the access token.
 * The access itself is **not** loaded from token here as it may be modified in the course of
 * method execution, for example when calling a batch of methods. It is the API methods'
 * responsibility to load the access when needed.
 *
 * @param {Object} usersStorage
 * @param {Object} userAccessesStorage
 * @param {Object} sessionsStorage
 * @param {Object} userStreamsStorage
 */
module.exports = function initContext(
  storageLayer: StorageLayer, customAuthStepFn: ?CustomAuthFunction
) {
  return function (
    req: express$Request, res: express$Response, next: express$NextFunction
  ) {
    const authorizationHeader = getAuth(req); 

    // FLOW We should not do this, but we're doing it.
    req.context = new MethodContext(
      req.params.username,
      authorizationHeader, 
      storageLayer,
      customAuthStepFn);
    req.context.retrieveUser(next);
    
    function getAuth(req): ?string {
      let authorizationHeader = req.header('authorization');

      if (authorizationHeader != null) {
        if (Array.isArray(authorizationHeader)) return authorizationHeader[0];
        return authorizationHeader;        
      }
      
      // assert: no authorization in header, let's check query: 
      const authFromQuery = req.query.auth; 
      
      if (authFromQuery == null) return null; 
      if (Array.isArray(authFromQuery)) return authFromQuery[0];
      return authFromQuery;
    }
  };
};
module.exports.injectDependencies = true; // make it DI-friendly
