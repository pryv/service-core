/* @flow */
'use strict';

import type Settings from './Settings';

const express = require('express');
const middleware = require('components/middleware');

/**
 * HTTP server responsible for the REST api that the HFS server exposes. 
 */
class Server {
  // Server settings.
  settings: Settings;
  
  // The express application. 
  expressApp: any; 
  
  constructor(settings: Settings) {
    this.settings = settings; 
    
    this.expressApp = this.setupExpress();  
  }
  
  /**
   * Starts the HTTP server. 
   */
  start(): void {
    const settings = this.settings;
    const app = this.expressApp;
    
    app.listen(
      settings.http.port, settings.http.ip, 
      this.serverListening.bind(this));
  }
  
  /** 
   * Called by http server once it is ready to accept connections. 
   */
  serverListening(): void {
    // yes. 
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

    app.use(middleware.requestTrace);
    app.use(express.bodyParser());
    app.use(middleware.override);
    app.use(middleware.commonHeaders);
    app.use(app.router);
    app.use(middleware.notFound);
    // TODO Do we need to copy this behaviour from api-server?
    // app.use(errorsMiddleware);

    return app; 
  }
}

module.exports = Server;