/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/* @flow */

const http = require('http');
const express = require('express');
const bluebird = require('bluebird');

const bodyParser = require('body-parser');
const middleware = require('middleware');
const errorsMiddleware = require('./middleware/errors');
const tracingMiddlewareFactory = require('./tracing/middleware/trace');
const clsWrapFactory = require('./tracing/middleware/clsWrap');

const controllerFactory = require('./web/controller');
const getAuth = require('middleware/src/getAuth');

const KEY_IP = 'http:ip';
const KEY_PORT = 'http:port';  

import type Context  from './context';

const { getConfig, getLogger } = require('@pryv/boiler');

/**
 * HTTP server responsible for the REST api that the HFS server exposes. 
 */
class Server {
  // Server settings.
  config;
  
  // The express application. 
  expressApp: express$Application; 
  
  // base url for any access to this server. 
  baseUrl: string; 
  
  // http server object
  server: net$Server; 
  
  // Logger used here.
  logger; 
  errorlogger; 
  
  // Web request context
  context: Context; 
  
  

  constructor(config, context: Context) {
    this.logger = getLogger('server');
    this.errorLogger = this.logger.getLogger('errors');
    this.config = config; 
  
    this.context = context; 
    
   
    
    this.logger.info('constructed.');
  }


  /**
   * Starts the HTTP server. 
   * 
   * @return {Promise<true>} A promise that will resolve once the server is 
   *    started and accepts connections.
   */
  async start(): Promise<true> {
    await getConfig(); // makes sure config is loaded
    const ip = this.config.get(KEY_IP); 
    const port = this.config.get(KEY_PORT); 
    this.baseUrl = `http://${ip}:${port}/`;
    this.logger.info('starting... on port: ' + port);
    this.logger.debug('starting on: ' + this.baseUrl);
    
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
    
    const serverClose = bluebird.promisify(server.close, {context: server}); 
    return serverClose();
  }
  
  /** 
   * Sets up the express application, injecting middleware and configuring the 
   * instance. 
   * 
   * @return express application.
   */
  async setupExpress(): Promise<express$Application> {
    const logger = this.logger;
    const config = this.config;
    const traceEnabled = config.get('trace:enable'); 
        
    const app = express(); 
    
    app.disable('x-powered-by');
    
    if (traceEnabled) {
      logger.info('Enabling opentracing features.');
      app.use(clsWrapFactory());
      app.use(tracingMiddlewareFactory(this.context));
    }
    app.use(middleware.subdomainToPath([]));
    app.use(middleware.requestTrace(express, logger));
    app.use(bodyParser.json({ limit: config.get('uploads:maxSizeMb') + 'mb' }));
    app.use(middleware.override);
    app.use(await middleware.commonHeaders());
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