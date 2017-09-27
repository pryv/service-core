var middleware = require('components/middleware'),
    Paths = require('./routes/Paths'),
    _ = require('lodash');
const config = require('./config');

/**
 * The Express app definition.
 */
module.exports = function (express, commonHeadersMiddleware, errorsMiddleware,
                           requestTraceMiddleware) {
  var app = express();

  // register common middleware

  app.disable('x-powered-by');

  // put this before request tracing in order to see username in paths
  var ignoredPaths = _.filter(Paths, function (item) {
    return _.isString(item) && item.indexOf(Paths.Params.Username) === -1;
  });
  app.use(middleware.subdomainToPath(ignoredPaths));

  app.use(requestTraceMiddleware);
  app.use(express.bodyParser());
  app.use(middleware.override);
  app.use(commonHeadersMiddleware);
  app.use(app.router);
  
  // Activate Airbrake if needed
  activateAirbrake(app);

  app.use(middleware.notFound);
  app.use(errorsMiddleware);
  
  // define init sequence utils
  app.setupTempRoutesForStartup = function setupTempRoutesForStartup() {
    app.get('*', handleRequestDuringStartup);
    app.post('*', handleRequestDuringStartup);
    app.put('*', handleRequestDuringStartup);
    app.del('*', handleRequestDuringStartup);
  };

  app.clearTempRoutes = function clearTempRoutes() {
    app.routes.get = [];
    app.routes.post = [];
    app.routes.put = [];
    app.routes.delete = [];
  };

  return app;
};
module.exports.injectDependencies = true;

function activateAirbrake(app) {
  const logSettings = config.load().logs;
  if(logSettings != null) {
    const airbrakeSettings = logSettings.airbrake;
    if(airbrakeSettings != null && airbrakeSettings.active) {
      const projectId = airbrakeSettings.projectId;
      const key = airbrakeSettings.key;
      if(projectId != null && key != null){
        const airbrake = require('airbrake').createClient(projectId, key);
        airbrake.handleExceptions();
        app.use(airbrake.expressHandler());
      }
    }
  }
}

function handleRequestDuringStartup(req, res) {
  res.send({
    id: 'api-unavailable',
    message: 'The API is temporarily unavailable; please try again in a moment.'
  }, 503);
}
