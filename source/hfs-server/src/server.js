/* @flow */

import type Settings from './Settings';

const http = require('http');
const express = require('express');

const bodyParser = require('body-parser');
const middleware = require('components/middleware');
const logging = require('components/utils/src/logging');
const errorsMiddleware = require('./middleware/errors');

const promisify = require('./promisify');

const controller = require('./web/controller');
const Context = require('./web/context');

const KEY_IP = 'http.ip';
const KEY_PORT = 'http.port';  

import type {Logger} from 'components/utils/src/logging';

/**
 * HTTP server responsible for the REST api that the HFS server exposes. 
 */
class Server {
  // Server settings.
  settings: Settings;
  
  // The express application. 
  expressApp: any; 
  
  // base url for any access to this server. 
  baseUrl: string; 
  
  // http server object
  server: http$Server; 
  
  // Logger used here.
  logger: Logger; 
  errorLogger: Logger; 
  
  // Web request context
  context: Context; 
  
  constructor(settings: Settings, context: Context) {
    const logSettings = settings.get('logs').obj();
    const logFactory = logging(logSettings);
    
    this.logger = logFactory.getLogger('hfs-server');
    this.errorLogger = logFactory.getLogger('errors');
    this.settings = settings; 
  
    this.context = context; 
    this.expressApp = this.setupExpress();
    
    const ip = settings.get(KEY_IP).str(); 
    const port = settings.get(KEY_PORT).num(); 
    this.baseUrl = `http://${ip}:${port}/`;
    
    this.logger.info('constructed.');
  }
  
  /**
   * Starts the HTTP server. 
   * 
   * @return {Promise<true>} A promise that will resolve once the server is 
   *    started and accepts connections.
   */
  start(): Promise<true> {
    this.logger.info('starting...');
    
    const settings = this.settings;
    const app = this.expressApp;
    
    const ip = settings.get(KEY_IP).str(); 
    const port = settings.get(KEY_PORT).num(); 
    
    var server = this.server = http.createServer(app);
    
    return promisify(server.listen, server)(port, ip)
      .then(this.logStarted.bind(this));
  }
  
  /** Logs that the server has started.
   */
  logStarted(arg: any): Promise<*> {
    const addr = this.server.address(); 
    this.logger.info(`started. (http://${addr.address}:${addr.port})`);
    
    // passthrough of our single argument
    return arg;
  }
  
  /** 
   * Stops a running server instance. 
   * 
   * @return {Promise<true>} A promise that will resolve once the server has 
   *    stopped. 
   */
  stop(): Promise<true> {
    const server = this.server;
      
    this.logger.info('stopping...');
    return promisify(server.close, server)();
  }
  
  /** 
   * Sets up the express application, injecting middleware and configuring the 
   * instance. 
   * 
   * @return express application.
   */
  setupExpress(): express$Application {
    const settings = this.settings;
    const logSettings = settings.get('logs').obj();
    
    var app = express(); 
    
    app.disable('x-powered-by');

    app.use(middleware.requestTrace(express, logging(logSettings)));
    app.use(bodyParser.json());
    app.use(middleware.override);
    app.use(middleware.commonHeaders({version: '1.0.0'}));
    
    this.defineApplication(app); 
        
    app.use(middleware.notFound);
    app.use(errorsMiddleware(this.errorLogger));

    return app; 
  }
  
  /** Defines all the routes that we serve from this server. 
   */   
  defineApplication(app: express$Application) {
    const c = controller; 
    
    app.get('/system/status', systemStatus);
    
    const ctx = this.context; 
    app.post('/events/:event_id/series', c.storeSeriesData(ctx)); 
    app.get('/events/:event_id/series', c.querySeriesData(ctx));
  }
}

/** GET /system/status - Answers the caller with a status of the application. 
 * This call should eventually permit health checks for this subsystem. 
 */ 
function systemStatus(req: express$Request, res: express$Response) {
  res
    .status(200)
    .json({
      status: 'ok',
    });
}

module.exports = Server;