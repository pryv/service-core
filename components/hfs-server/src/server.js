/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const http = require('http');
const express = require('express');
const util = require('util');
const bodyParser = require('body-parser');
const middleware = require('middleware');
const errorsMiddleware = require('./middleware/errors');
const tracingMiddlewareFactory = require('./tracing/middleware/trace');
const clsWrapFactory = require('./tracing/middleware/clsWrap');
const controllerFactory = require('./web/controller');
const getAuth = require('middleware/src/getAuth');
const KEY_IP = 'http:ip';
const KEY_PORT = 'http:port';
const { getConfig, getLogger } = require('@pryv/boiler');
/**
 * HTTP server responsible for the REST api that the HFS server exposes.
 */
class Server {
  // Server settings.

  config;
  // The express application.

  expressApp;
  // base url for any access to this server.

  baseUrl;
  /**
   * http server object
   * @type {http.Server}
   */
  server;
  // Logger used here.

  logger;

  errorlogger;
  // Web request context

  context;
  constructor (config, context) {
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
    started and accepts connections.
   */
  async start () {
    await getConfig(); // makes sure config is loaded
    const ip = this.config.get(KEY_IP);
    const port = this.config.get(KEY_PORT);
    this.baseUrl = `http://${ip}:${port}/`;
    this.logger.info('starting... on port: ' + port);
    this.logger.debug('starting on: ' + this.baseUrl);
    const app = await this.setupExpress();
    this.expressApp = app;
    const server = (this.server = http.createServer(app));
    const serverListen = util.promisify(server.listen).bind(server);
    return serverListen(port, ip).then(this.logStarted.bind(this));
  }

  /** Logs that the server has started.
   * @param {any} arg
   * @returns {Promise<any>}
   */
  logStarted (arg) {
    const addr = this.server.address();
    this.logger.info(`started. (http://${addr.address}:${addr.port})`);
    // passthrough of our single argument
    return arg;
  }

  /**
   * Stops a running server instance.
   *
   * @return {Promise<true>} A promise that will resolve once the server has
    stopped.
   */
  async stop () {
    const server = this.server;
    this.logger.info('stopping...');
    const serverClose = util.promisify(server.close).bind(server);
    return serverClose();
  }

  /**
   * Sets up the express application, injecting middleware and configuring the
   * instance.
   *
   * @return {Promise<any>} express application.
   */
  async setupExpress () {
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
   * @param {express$Application} app
   * @returns {void}
   */
  defineApplication (app) {
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
 * @param {express$Request} req
 * @param {express$Response} res
 * @returns {void}
 */
function systemStatus (req, res) {
  res.status(200).json({
    status: 'ok'
  });
}
module.exports = Server;
