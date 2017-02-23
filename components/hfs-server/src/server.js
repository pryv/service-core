/* @flow */
'use strict';

import type Settings from './Settings';

const http = require('http');
const express = require('express');
const middleware = require('components/middleware');
const logging = require('components/utils').logging;
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
  server: http.Server;
  
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
  }
  
  /**
   * Starts the HTTP server. 
   */
  start(): Promise<true> {
    const settings = this.settings;
    const app = this.expressApp;
    
    const ip = settings.get(KEY_IP).str(); 
    const port = settings.get(KEY_PORT).num(); 
    
    var server = this.server = http.createServer(app);
    
    return promisify(server.listen, server)(port, ip);
  }
  
  /** 
   * Stops a running server instance. 
   */
  stop(): Promise<true> {
    const server = this.server;
    
    return promisify(server.close, server)();
  }
    
  /** 
   * Sets up the express application, injecting middleware and configuring the 
   * instance. 
   * 
   * @return express application.
   */
  setupExpress(): any {
    const settings = this.settings;
    const logSettings = settings.get('logs').obj();
    
    var app = express(); 
    
    app.disable('x-powered-by');

    app.use(middleware.requestTrace(express, logging(logSettings)));
    app.use(express.bodyParser());
    app.use(middleware.override);
    app.use(middleware.commonHeaders({version: '1.0.0'}));
    app.use(app.router);
    app.use(middleware.notFound);
    
    // TODO Do we need to copy this behaviour from api-server?
    // app.use(errorsMiddleware);
    
    app.all('*', (req, res) => {
      res.json({status: 'ok'}, 200);
    });

    return app; 
  }
}

module.exports = Server;