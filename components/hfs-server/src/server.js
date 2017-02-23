/* @flow */
'use strict';

import type Settings from './Settings';

// TODO Maybe this should be moved to the configuration file. 
const logSettings = {
  console: {
    active: true, 
  }, 
  file: {
    active: false, 
  }, 
  airbrake: {
    active: false, 
  }
};

const http = require('http');
const express = require('express');
const middleware = require('components/middleware');
const logging = require('components/utils').logging;
const promisify = require('./promisify');

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
    this.logger = logging(logSettings).getLogger('hfs-server');
    this.settings = settings; 
        
    this.expressApp = this.setupExpress();
    
    const http = settings.http; 
    this.baseUrl = `http://${http.ip}:${http.port}/`;
  }
  
  /**
   * Starts the HTTP server. 
   */
  start(): Promise<true> {
    const settings = this.settings;
    const app = this.expressApp;
    
    const port = settings.http.port; 
    const hostname = settings.http.ip; 
    
    var server = this.server = http.createServer(app);
    
    return promisify(server.listen, server)(port, hostname);
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