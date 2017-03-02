var middleware = require('components/middleware');

/**
 * The Express app definition.
 */
module.exports = function (express, commonHeadersMiddleware, errorsMiddleware,
                           requestTraceMiddleware) {
  var app = express();

  app.disable('x-powered-by');

  // put this before request tracing in order to see username in paths
  // TODO: possibly improve by using a Paths object as done on api-server
  //var ignoredPaths = _.filter(Paths, function (item) {
  //  return _.isString(item) && item.indexOf(Paths.Params.Username) === -1;
  //});
  app.use(middleware.subdomainToPath([]));

  app.use(requestTraceMiddleware);
  app.use(express.bodyParser());
  app.use(commonHeadersMiddleware);
  app.use(app.router);
  app.use(errorsMiddleware);

  return app;
};
module.exports.injectDependencies = true;
