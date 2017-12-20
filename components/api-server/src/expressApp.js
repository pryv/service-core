// @flow

const express = require('express');
const _ = require('lodash');
const bodyParser = require('body-parser');

const middleware = require('components/middleware');
const errorsMiddlewareMod = require('./middleware/errors'); 

const Paths = require('./routes/Paths');
const config = require('./config');


/** Handles requests during application startup. 
 */
function handleRequestDuringStartup(req: express$Request, res: express$Response) {
  res.status(503).send({
    id: 'api-unavailable',
    message: 'The API is temporarily unavailable; please try again in a moment.' });
}

type AirbrakeSettings = {
  projectId: string, key: string,
};

/** Manages our express app during application startup. 
 * 
 * During application startup, this will manage the express application and 
 * allow responding to http requests before we have a database connection. 
 * 
 * Please call these functions in order: 
 *  
 *  * `appStartupBegin`: at the very start of your application; this is called
 *    for you by this file. 
 *  * `appStartupComplete`: When you're ready to server connections, call this 
 *    before adding your routes to express. 
 *  * `routesAdded`: Once all routes are there, call this to add error-handling
 *    middleware. 
 * 
 * @see handleRequestDuringStartup
 */
type Phase = 'init' | 'startupBegon' | 'startupComplete' | 'routesAdded';
class ExpressAppLifecycle {  
  // State for the state machine. 
  phase: Phase;
  
  // The express app. 
  app: express$Application; 
  
  // These are the routes that we add until the startup of the application is 
  // complete. 
  tempRoutes: express$Route; 
  
  // Error handling middleware, injected as dependency. 
  errorHandlingMiddleware: express$Middleware; 
  
  /** Constructs a life cycle manager for an express app. 
   */
  constructor(app: express$Application, errorHandlingMiddleware: express$Middleware) {
    this.app = app; 
    this.errorHandlingMiddleware = errorHandlingMiddleware; 
    this.phase = 'init';
  }
  
  /** Enter the phase given.  
   */
  go(phase: Phase): void {
    this.phase = phase; 
  }

  // Inserts airbrake related middleware into the stack. 
  // 
  activateAirbrake() {
    const app = this.app; 
    
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
    const settings = this.getAirbrakeSettings(); 
    if (settings == null) return; 

    const airbrake = require('airbrake').createClient(
      settings.projectId, settings.key);

    airbrake.addFilter(function (notice) {
      if (notice.environment['err.dontNotifyAirbrake']) {
        // Ignore errors with this messsage
        return null;
      }
      return notice;
    });

    app.use(airbrake.expressHandler());
  }

  getAirbrakeSettings(): ?AirbrakeSettings {
    // TODO Directly hand log settings to this class. 
    const logSettings = config.load().logs;
    if (logSettings == null) return null; 
    
    const airbrakeSettings = logSettings.airbrake;
    if (airbrakeSettings == null || !airbrakeSettings.active) return null; 
    
    const projectId = airbrakeSettings.projectId;
    const key = airbrakeSettings.key;
    if (projectId == null || key == null) return null; 
    
    return {
      projectId: projectId, 
      key: key,
    };
  }

  // ------------------------------------------------------ state machine events
  
  /** Called before we have a database connection. This prevents errors while
   * the boot sequence is in progress. 
   */
  appStartupBegin(): void {
    const app = this.app; 
    
    this.go('startupBegon'); 
    
    // Insert a middleware that allows us to intercept requests. This will 
    // be disabled as soon as `this.phase` is not 'startupBegon' anymore. 
    app.use((req: express$Request, res, next) => {
      if (this.phase === 'startupBegon') {
        handleRequestDuringStartup(req, res);
      }
      else {
        next(); 
      }
    });
  }
  
  /** Called after we have a database connection and just before we define 
   * the application routes. 
   */
  appStartupComplete() {
    this.go('startupComplete');
  }
  
  /** Called when all application routes have been added to `this.app`. 
   */
  routesAdded() {
    const app = this.app; 
    this.go('routesAdded');
    
    app.use(middleware.notFound);
    
    // Activate Airbrake if needed
    this.activateAirbrake();
    
    app.use(this.errorHandlingMiddleware);
  }
}

// ------------------------------------------------------------ express app init

function expressAppInit(dependencies: any) {
  const commonHeadersMiddleware = dependencies.resolve(middleware.commonHeaders); 
  const requestTraceMiddleware = dependencies.resolve(middleware.requestTrace); 
  const errorsMiddleware = dependencies.resolve(errorsMiddlewareMod);
    
  var app = express();

  // register common middleware

  app.disable('x-powered-by');

  // put this before request tracing in order to see username in paths
  var ignoredPaths = _.filter(Paths, function (item) {
    return _.isString(item) && item.indexOf(Paths.Params.Username) === -1;
  });
  app.use(middleware.subdomainToPath(ignoredPaths));

  // Parse JSON bodies: 
  app.use(bodyParser.json());

  // This object will contain key-value pairs, where the value can be a string
  // or array (when extended is false), or any type (when extended is true).
  app.use(bodyParser.urlencoded({
    extended: false}));
    
  // Other middleware:
  app.use(requestTraceMiddleware);
  app.use(middleware.override);
  app.use(commonHeadersMiddleware);

  const lifecycle = new ExpressAppLifecycle(app, errorsMiddleware); 
  return {
    app: app, 
    lifecycle: lifecycle,
  };
}

module.exports = expressAppInit;

export type { ExpressAppLifecycle };
