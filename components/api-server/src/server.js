// @flow

const express = require('express');

const http = require('http');
const childProcess = require('child_process');
const CronJob = require('cron').CronJob;
const dependencies = require('dependable').container({useFnAnnotations: true});
const bluebird = require('bluebird');
const EventEmitter = require('events');

const middleware = require('components/middleware');
const storage = require('components/storage');
const utils = require('components/utils');

const Notifications = require('./Notifications');
const API = require('./API');

import type { ConfigAccess } from './settings';

import type { LogFactory, Logger } from 'components/utils';

// Server class for api-server process. To use this, you 
// would 
// 
//    const server = new Server(); 
//    server.start(); 
// 
class Server {
  settings: ConfigAccess; 
  
  logFactory: LogFactory; 
  logger: Logger; 
  
  api: API; 
  // API for system routes. 
  systemAPI: API; 
  
  // Axon based internal notification and messaging bus. 
  notificationBus: Notifications;
  
  storageLayer: storage.StorageLayer; 
  
  // Load settings and setup base configuration. 
  //
  constructor(settings: ConfigAccess) {
    this.settings = settings;
    
    const logging = utils.logging(settings.get('logs').obj()); 
    this.logger = logging.getLogger('api-server');
    this.logFactory = logging.getLogger;
    
    this.api = new API(); 
    this.systemAPI = new API(); 
    
    // We're going to fade the use of 'logging' out, so we only store it there:
    dependencies.register({ logging: logging });
  }
  
  // Setup this.storageLayer.
  //
  setupStorageLayer() {
    const settings = this.settings;

    const database = new storage.Database(
      settings.get('database').obj(), 
      this.logFactory('database'));

    // 'StorageLayer' is a component that contains all the vertical registries
    // for various database models. 
    this.storageLayer = new storage.StorageLayer(database, 
      this.logFactory('model'),
      settings.get('eventFiles.attachmentsDirPath').str(), 
      settings.get('eventFiles.previewsDirPath').str(), 
      settings.get('auth.passwordResetRequestMaxAge').num(), 
      settings.get('auth.sessionMaxAge').num(), 
    );
    
    // Now map back to DI: We hope that this bit will eventually disappear. 
    const sl = this.storageLayer;
    dependencies.register({
      // storage
      versionsStorage: sl.versions,
      passwordResetRequestsStorage: sl.passwordResetRequests,
      sessionsStorage: sl.sessions,
      usersStorage: sl.users,
      userAccessesStorage: sl.accesses,
      userEventFilesStorage: sl.eventFiles,
      userEventsStorage: sl.events,
      userFollowedSlicesStorage: sl.followedSlices,
      userProfileStorage: sl.profile,
      userStreamsStorage: sl.streams,
      
      // and finally, for code that is almost, but not quite there
      storageLayer: sl, 
    });
  }
  
  // Start the server. 
  //
  async start() {
    const settings = this.settings;
    const logger = this.logger;
    
    dependencies.register({
      api: this.api,
      // use separate API instance to avoid any possible security issue
      systemAPI: this.systemAPI 
    });
    
    this.publishLegacySettings(settings); 
    this.setupStorageLayer();
    this.publishExpressMiddleware(settings);
    
    const {app, lifecycle} = require('./expressApp')(dependencies);
    dependencies.register({expressApp: app});

    // start TCP pub messaging
    await this.setupNotificationBus();

    // register API methods
    this.registerApiMethods();

    // setup temp routes for handling requests during startup (incl. possible
    // data migration)
    lifecycle.appStartupBegin(); 

    // Setup HTTP and register server; setup Socket.IO.
    const server = http.createServer(app);
    this.setupSocketIO(server); 
    await this.startListen(server);

    // Setup DB connection
    await this.storageLayer.waitForConnection();
    try {
      await this.migrateIfNeeded();
    }
    catch(err) {
      // TODO We need to do more, that's clear. An actual WIP. 
      logger.error('Could not migrate.');
    }
    
    // Finish booting the server, start accepting connections.
    await this.addRoutes();
    
    // Let actual requests pass.
    lifecycle.appStartupComplete(); 
    
    await this.setupNightlyScript(server);
    
    logger.info('Server ready.');
    this.notificationBus.serverReady();
  }
  
  // Requires and registers all API methods. 
  // 
  registerApiMethods() {
    [
      require('./methods/system'),
      require('./methods/utility'),
      require('./methods/auth'),
      require('./methods/accesses'),
      require('./methods/account'),
      require('./methods/followedSlices'),
      require('./methods/profile'),
      require('./methods/streams'),
      require('./methods/events'),
      require('./methods/trackingFunctions'),
    ].forEach(function (moduleDef) {
      dependencies.resolve(moduleDef);
    });
  }
  
  // Publishes dependencies for legacy code that accesses whole parts of the 
  // settings object. 
  // 
  publishLegacySettings(settings: ConfigAccess) {
    // register base dependencies (aka global variables)
    dependencies.register({
      // settings
      authSettings: settings.get('auth').obj(),
      auditSettings: settings.get('audit').obj(),
      eventFilesSettings: settings.get('eventFiles').obj(),
      eventTypesSettings: settings.get('eventTypes').obj(),
      httpSettings: settings.get('http').obj(),
      servicesSettings: settings.get('services').obj(),
      updatesSettings: settings.get('updates').obj(),

      // misc utility
      serverInfo: require('../package.json'),
    });
  }
  
  // Publishes dependencies for express middleware setup. 
  // 
  publishExpressMiddleware(settings: ConfigAccess) {
    const customAuthStepFn = settings.getCustomAuthFunction();
    const initContextMiddleware = middleware.initContext(
      this.storageLayer, customAuthStepFn);

    dependencies.register({
      // Express middleware
      attachmentsAccessMiddleware: middleware.attachmentsAccess,
      initContextMiddleware: initContextMiddleware,
      
      express: express, 
    });
  }
  
  setupSocketIO(server: http$Server) {
    const logFactory = this.logFactory; 
    const notificationBus = this.notificationBus;
    const api = this.api; 
    const storageLayer = this.storageLayer;
    const settings = this.settings; 
    const customAuthStepFn = settings.getCustomAuthFunction();
        
    const socketIOsetup = require('./socket-io');
    socketIOsetup(
      server, logFactory('socketIO'), 
      notificationBus, api, 
      storageLayer, customAuthStepFn);
  }
  
  // Open http/https port and listen to incoming connections. 
  //
  async startListen(server: http$Server) {
    const settings = this.settings; 
    const logger = this.logger; 
    
    const port = settings.get('http.port').num();
    const hostname = settings.get('http.ip').str(); 
    
    // All listen() methods can take a backlog parameter to specify the maximum
    // length of the queue of pending connections. The actual length will be
    // determined by the OS through sysctl settings such as tcp_max_syn_backlog
    // and somaxconn on Linux. The default value of this parameter is 511 (not
    // 512).
    const backlog = 511;
    
    // Start listening on the HTTP port. 
    await bluebird.fromCallback(
      (cb) => server.listen(port, hostname, backlog, cb));
      
    const address = server.address();
    const protocol = server.key ? 'https' : 'http';
    
    const serverUrl = protocol + '://' + address.address + ':' + address.port;
    logger.info(`Core Server (API module) listening on ${serverUrl}`);
    
    // Warning if ignoring forbidden updates
    if (settings.get('updates.ignoreProtectedFields').bool()) {
      logger.warn('Server configuration has "ignoreProtectedFieldUpdates" set to true: ' +
        'This means updates to protected fields will be ignored and operations will succeed. ' +
        'We recommend turning this off, but please be aware of the implications for your code.');
    }
    
    // TEST: execute test setup instructions if any
    const instanceTestSetup = settings.get('instanceTestSetup'); 
    if (process.env.NODE_ENV === 'test' && instanceTestSetup.exists()) {
      try {
        const axonSocket = this.notificationBus.axonSocket;
        require('components/test-helpers')
          .instanceTestSetup.execute(instanceTestSetup.str(), axonSocket);
      } catch (err) {
        logger.warn('Error executing instance test setup instructions: ' + err.message);
      }
    }
  }
  
  // Opens an axon PUB socket. The socket will be used for three purposes: 
  //
  //  a) Internal communication via events, called directly on the notifications 
  //    instance. 
  //  b) Communication with the tests. When ran via InstanceManager, this is 
  //    used to synchronize with the tests. 
  //  c) For communication with other api-server processes on the same core. 
  // 
  // You can turn this off! If you set 'tcpMessaging.enabled' to false, no axon
  // messaging will be performed. This method returns a plain EventEmitter 
  // instead; allowing a) and c) to work. The power of interfaces. 
  // 
  async openNotificationBus(): EventEmitter {
    const logger = this.logger; 
    const settings = this.settings; 

    const enabled = settings.get('tcpMessaging.enabled').bool();
    if (! enabled) return new EventEmitter(); 
    
    const tcpMessaging = settings.get('tcpMessaging').obj();
    const host = settings.get('tcpMessaging.host').str();
    const port = settings.get('tcpMessaging.port').num();
    
    try {
      const socket = await bluebird.fromCallback(
        (cb) => utils.messaging.openPubSocket(tcpMessaging, cb));
        
      logger.info(`TCP pub socket ready on ${host}:${port}`);
      return socket; 
    }
    catch (err) {
      logger.error('Error setting up TCP pub socket: ' + err);
      process.exit(1);
    }
  }
  
  // Sets up `Notifications` bus and registers it for everyone to consume. 
  // 
  async setupNotificationBus() {
    const notificationEvents = await this.openNotificationBus();
    const bus = this.notificationBus = new Notifications(notificationEvents);
    
    dependencies.register({
      notifications: bus,
    });
  }
  
  // Installs actual routes in express and prints 'Server ready'.
  //
  addRoutes() {
    [
      require('./routes/system'),
      require('./routes/root'),
      require('./routes/auth'),
      require('./routes/accesses'),
      require('./routes/account'),
      require('./routes/followed-slices'),
      require('./routes/profile'),
      require('./routes/streams'),
      require('./routes/events'),
    ].forEach(function (moduleDef) {
      dependencies.resolve(moduleDef);
    });
  }
  
  // Migrates mongodb database to the latest version, if needed. 
  // 
  migrateIfNeeded(): Promise<mixed> {
    return bluebird.fromCallback(
      (cb) => this.storageLayer.versions.migrateIfNeeded(cb));
  }
  
  /**
   * @param server The server object to expose function `runNightlyScript()` on
   */
  setupNightlyScript(server: http$Server) {
    const logger = this.logger; 
    const settings = this.settings;
    
    var workerRunning = false;
    var cronJob = new CronJob({
      cronTime: settings.get('nightlyScriptCronTime').str() || '00 15 2 * * *',
      onTick: function () {
        if (workerRunning) {
          return;
        }

        logger.info('Starting nightly script (cron job)...');
        runScript();
      }
    });

    logger.info('Cron job setup for nightly script, time pattern: ' + cronJob.cronTime);
    cronJob.start();
    
    // FLOW TODO Find some other way of connecting things apart from decorating 
    // FLOW   base library objects. 
    server.runNightlyScript = runScript;

    /**
     * @param {Function} callback Optional, will be passed an error on failure
     */
    function runScript(callback) {
      var worker = childProcess.fork(__dirname + '/runNightlyTasks.js', process.argv.slice(2));
      workerRunning = true;
      worker.on('exit', function (code) {
        workerRunning = false;
        
        if (! callback) { return; }
        if (code !== 0) {
          return callback(
            new Error('Nightly script unexpectedly failed (see logs for details)'));
        }

        callback();
      });
    }
  }

}
module.exports = Server; 

