const middleware = require('components/middleware');
const bodyParser = require('body-parser');


/**
 * The Express app definition.
 */
module.exports = function expressApp(express, commonHeadersMiddleware, errorsMiddleware,
                           requestTraceMiddleware) {
  var app = express();
  
  /** Called once routes are defined on app, allows finalizing middleware stack
   * with things like error handling. 
   **/
  function routesDefined() {
    app.use(errorsMiddleware);
  }

  app.disable('x-powered-by');

  app.use(middleware.subdomainToPath([]));

  app.use(requestTraceMiddleware);
  app.use(bodyParser.json());
  app.use(commonHeadersMiddleware);
  
  return {
    expressApp: app, 
    routesDefined: routesDefined, 
  };
};
module.exports.injectDependencies = true;
