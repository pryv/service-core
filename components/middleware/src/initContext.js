/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

const { MethodContext } = require('business');


// Returns a middleware function that initializes the method context into
// `req.context`. The context is initialized with the user (loaded from
// username) and the access token. the access itself is **not** loaded from
// token here as it may be modified in the course of method execution, for
// example when calling a batch of methods. it is the api methods'
// responsibility to load the access when needed. 
// 
module.exports = function initContext(
  storageLayer, customAuthStepFn
) {
  return function (
    req, res, next
  ) {
    const authorizationHeader = req.headers['authorization'];

    const contextSource = {
      name: 'http',
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
    };
    // FLOW We should not do this, but we're doing it.
    req.context = new MethodContext(
      contextSource,
      req.params.username,
      authorizationHeader, 
      customAuthStepFn,
      req.headers,
      req.query,
      req.tracing,
    );
    
    // Convert the above promise into a callback. 
    return req.context.init().then(() => next()).catch(next);
  };
};
