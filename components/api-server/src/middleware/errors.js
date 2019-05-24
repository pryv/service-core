// @flow

const errors = require('components/errors');
const errorsFactory = errors.factory;
const APIError = errors.APIError;
const errorHandling = errors.errorHandling;
const setCommonMeta = require('../methods/helpers/setCommonMeta');

/** Error route handling.
 */
function produceHandleErrorMiddleware(logging: any) {
  const logger = logging.getLogger('routes');

  // NOTE next is not used, since the request is terminated on all errors. 
  /*eslint-disable no-unused-vars*/
  return function handleError(error, req: express$Request, res: express$Response, next: () => void) {
    if (! (error instanceof APIError) && error.status) {
      // it should be coming from Express' bodyParser: just wrap the error
      error = errorsFactory.invalidRequestStructure(error.message);
    }

    errorHandling.logError(error, req, logger);

    if (req.context != null && req.context.access != null) {
      res.header('Access-Id', req.context.access.id);
    }
    
    res
      .status(error.httpStatus || 500)
      .json(
        setCommonMeta(
          {error: errorHandling.getPublicErrorData(error)}));
  };
}

module.exports = produceHandleErrorMiddleware;
module.exports.injectDependencies = true;
