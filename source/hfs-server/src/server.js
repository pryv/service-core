/* @flow */

import type Settings from './Settings';

const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const middleware = require('components/middleware');
const logging = require('components/utils').logging;
const errorsMiddleware = require('./middleware/errors');
const promisify = require('./promisify');

const KEY_IP = 'http.ip';
const KEY_PORT = 'http.port';  

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
  logger: typeof logging.Logger; 
  
  constructor(settings: Settings) {
    const logSettings = settings.get('logs').obj();
    const logFactory = logging(logSettings);
    
    this.logger = logFactory.getLogger('hfs-server');
    this.settings = settings; 
        
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
      .then((server) => { 
        this.logger.info(`started. (http://${ip}:${port})`);
        return server; });
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
        
    app.use(errorsMiddleware);
    app.use(middleware.notFound);

    return app; 
  }
  
  /** Defines all the routes that we serve from this server. 
   */   
  defineApplication(app: express$Application) {
    app.get('/system/status', systemStatus);
    
    app.all('*', errorOut);
  }
}

/** Catch-all handler that will error out for all routes that call this. 
 */
function errorOut(req: express$Request, res: express$Response, next) {
  return next(new Error(`Undefined route. (${req.path})`));
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