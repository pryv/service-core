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
  app.use(middleware.notFound);
  
  // Activate Airbrake if needed
  activateAirbrake(app);
  
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
  /*
    Quick guide on how to test Airbrake notifications (under logs entry):
    1. Update configuration file with Airbrake information:
        "airbrake": {
         "active": true,
         "key": "get it from pryv.airbrake.io settings",
         "projectId": "get it from pryv.airbrake.io settings"
       }
    2. Throw a fake error in the code (/routes/root.js is easy to trigger):
        throw new Error('This is a test of Airbrake notifications');
    3. Trigger the error by running the faulty code (run a local core)
   */
  const logSettings = config.load().logs;
  if(logSettings != null) {
    const airbrakeSettings = logSettings.airbrake;
    if(airbrakeSettings != null && airbrakeSettings.active) {
      const projectId = airbrakeSettings.projectId;
      const key = airbrakeSettings.key;
      if(projectId != null && key != null){
        const airbrake = require('airbrake').createClient(projectId, key);
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
