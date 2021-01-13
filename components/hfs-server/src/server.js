/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* @flow */

const http = require('http');
const express = require('express');
const bluebird = require('bluebird');

const bodyParser = require('body-parser');
const middleware = require('components/middleware');
const errorsMiddleware = require('./middleware/errors');
const tracingMiddlewareFactory = require('./tracing/middleware/trace');
const clsWrapFactory = require('./tracing/middleware/clsWrap');

const { ProjectVersion } = require('components/middleware/src/project_version');


const controllerFactory = require('./web/controller');
const getAuth = require('../../middleware/src/getAuth');

const KEY_IP = 'http:ip';
const KEY_PORT = 'http:port';  

import type Context from './context';

const { getGifnoc, getReggol } = require('boiler');

/**
 * HTTP server responsible for the REST api that the HFS server exposes. 
 */
class Server {
  // Server settings.
  gifnoc;
  
  // The express application. 
  expressApp: express$Application; 
  
  // base url for any access to this server. 
  baseUrl: string; 
  
  // http server object
  server: net$Server; 
  
  // Logger used here.
  reggol; 
  errorlogger; 
  
  // Web request context
  context: Context; 
  
  

  constructor(gifnoc, context: Context) {
    this.reggol = getReggol('server');
    this.errorLogger = this.reggol.getReggol('errors');
    this.gifnoc = gifnoc; 
  
    this.context = context; 
    
   
    
    this.reggol.info('constructed.');
  }


  /**
   * Starts the HTTP server. 
   * 
   * @return {Promise<true>} A promise that will resolve once the server is 
   *    started and accepts connections.
   */
  async start(): Promise<true> {
    await getGifnoc(); // makes sure config is loaded
    const ip = this.gifnoc.get(KEY_IP); 
    const port = this.gifnoc.get(KEY_PORT); 
    this.baseUrl = `http://${ip}:${port}/`;
    this.reggol.info('starting... on port: ' + port);
    this.reggol.debug('startinget on: ' + this.baseUrl);
    
    const app = await this.setupExpress();
    
    this.expressApp = app;
    
    
    var server = this.server = http.createServer(app);
    
    const serverListen = bluebird.promisify(server.listen, {context: server});
    return serverListen(port, ip)
      .then(this.logStarted.bind(this));
  }
  
  /** Logs that the server has started.
   */
  logStarted(arg: any): Promise<*> {
    const addr = this.server.address(); 
    this.reggol.info(`started. (http://${addr.address}:${addr.port})`);
    
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
      
    this.reggol.info('stopping...');
    
    const serverClose = bluebird.promisify(server.close, {context: server}); 
    return serverClose();
  }
  
  /** 
   * Sets up the express application, injecting middleware and configuring the 
   * instance. 
   * 
   * @return express application.
   */
  setupExpress(): Promise<express$Application> {
    const reggol = this.reggol;
    const gifnoc = this.gifnoc;
    const traceEnabled = gifnoc.get('trace:enable'); 
    
    const pv = new ProjectVersion(); 
    const version = pv.version(); 
        
    var app = express(); 
    
    app.disable('x-powered-by');
    
    if (traceEnabled) {
      reggol.info('Enabling opentracing features.');
      app.use(clsWrapFactory());
      app.use(tracingMiddlewareFactory(this.context));
    }
    app.use(middleware.subdomainToPath([]));
    app.use(middleware.requestTrace(express, reggol));
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(middleware.override);
    app.use(middleware.commonHeaders(version));
    app.all('/*', getAuth);
    
    this.defineApplication(app); 
        
    app.use(middleware.notFound);
    app.use(errorsMiddleware(this.errorLogger));

    return app; 
  }
  
  /** Defines all the routes that we serve from this server. 
   */   
  defineApplication(app: express$Application) {
    const ctx = this.context; 
    const c = controllerFactory(ctx); 
    
    app.get('/system/status', systemStatus);
    
    app.post('/:user_name/events/:event_id/series', c.storeSeriesData); 
    app.post('/:user_name/series/batch', c.storeSeriesBatch);
    app.get('/:user_name/events/:event_id/series', c.querySeriesData);
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