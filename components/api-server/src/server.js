// @flow

const express = require('express');

const http = require('http');
const childProcess = require('child_process');
const CronJob = require('cron').CronJob;
const dependencies = require('dependable').container({useFnAnnotations: true});
const bluebird = require('bluebird');
const EventEmitter = require('events');

const errors = require('components/errors');
const middleware = require('components/middleware');
const storage = require('components/storage');
const utils = require('components/utils');

const Notifications = require('./Notifications');
const API = require('./API');

import type { ConfigAccess } from './settings';

import type { LogFactory, Logger } from 'components/utils';
import type { ExpressAppLifecycle } from './expressApp';
import type { StorageLayer } from 'components/storage';

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
  
  storageLayer: StorageLayer; 
  
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
    this.storageLayer = {
      versions: new storage.Versions(
        database, 
        settings.get('eventFiles.attachmentsDirPath').str(), 
        this.logFactory('versions')),
      passwordResetRequests: new storage.PasswordResetRequests(
        database,{
          maxAge: settings.get('auth.passwordResetRequestMaxAge').num() }),
      sessions: new storage.Sessions(database, {
        maxAge: settings.get('auth.sessionMaxAge').num() }),
      users: new storage.Users(database),
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(
        settings.get('eventFiles').obj(), 
        this.logFactory('eventFiles')),
      events: new storage.user.Events(database),
      followedSlices: new storage.user.FollowedSlices(database),
      profile: new storage.user.Profile(database),
      streams: new storage.user.Streams(database),
      
      // Delegate connection waiting to the datbase: 
      waitForConnection: () => bluebird.fromCallback(
        (cb) => database.waitForConnection(cb)),
    };

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
    });
  }
  
  // Start the server. 
  //
  async start() {
    const settings = this.settings; 
    
    dependencies.register({
      api: this.api,
      // use separate API instance to avoid any possible security issue
      systemAPI: this.systemAPI 
    });
    
    // register base dependencies (aka global variables)
    dependencies.register({
      // settings
      authSettings: settings.get('auth').obj(),
      auditSettings: settings.get('audit').obj(),
      eventFilesSettings: settings.get('eventFiles').obj(),
      eventTypesSettings: settings.get('eventTypes').obj(),
      httpSettings: settings.get('http').obj(),
      servicesSettings: settings.get('services').obj(),

      // misc utility
      serverInfo: require('../package.json'),
    });
    
    const logger = this.logger; 
    
    this.setupStorageLayer();
    
    const customAuthStepFn = settings.getCustomAuthFunction();
    const initContextMiddleware = middleware.initContext(
      this.storageLayer, customAuthStepFn);

    dependencies.register({
      // Express middleware
      attachmentsAccessMiddleware: middleware.attachmentsAccess,
      initContextMiddleware: initContextMiddleware,
      
      express: express, 
    });

    const {app, lifecycle} = require('./expressApp')(dependencies);
    dependencies.register({expressApp: app});

    // start TCP pub messaging
    const axonSocket = await this.openAxonSocket();
    this.setupNotificationBus(axonSocket);

    // register API methods
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

    // setup temp routes for handling requests during startup (incl. possible
    // data migration)
    lifecycle.appStartupBegin(); 

    // setup HTTP and register server
    const server = http.createServer(app);
    
    // Allow everyone (and his dog) to access this server. 
    module.exports = server;
    dependencies.register({server: server});

    this.setupSocketIO(server); 

    // start listening to HTTP
    try {
      await this.startListen(server, axonSocket);
      await this.storageLayer.waitForConnection();
      await this.migrateIfNeeded();
      await this.readyServer(lifecycle);
      await this.setupNightlyScript(server);
    }
    catch (e) {
      this.handleStartupFailure(e);
    }

    process.on('exit', function () {
      logger.info('API server exiting.');
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
  
  async startListen(server: http$Server, axonSocket: EventEmitter) {
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
    
    // FLOW: For use during our testing (DEPRECATED)
    server.url = serverUrl;

    // TEST: execute test setup instructions if any
    const instanceTestSetup = settings.get('instanceTestSetup'); 
    if (process.env.NODE_ENV === 'test' && instanceTestSetup.exists()) {
      try {
        require('components/test-helpers')
          .instanceTestSetup.execute(instanceTestSetup.str(), axonSocket);
      } catch (err) {
        logger.warn('Error executing instance test setup instructions: ' + err.message);
      }
    }
  }
  
  // Opens an axon PUB socket. The socket will be used for three purposes mainly: 
  //  a) Internal communication via events, called directly on the notifications 
  //    instance. 
  //  b) Communication with the tests. When ran via InstanceManager, this is 
  //    used to synchronize with the tests. 
  //  c) For communication with other api-server processes on the same core. 
  // 
  async openAxonSocket(): EventEmitter {
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
  setupNotificationBus(messagingSocket: EventEmitter) {
    const bus = this.notificationBus = new Notifications(messagingSocket);
    
    dependencies.register({
      notifications: bus,
    });
  }
  
  // Installs actual routes in express and prints 'Server ready'.
  //
  readyServer(lifecycle: ExpressAppLifecycle) {
    const logger = this.logger; 
    
    // ok: setup proper API routes
    lifecycle.appStartupComplete(); 

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
    
    // ok: All routes setup. Add error handling middleware. 
    
    lifecycle.routesAdded(); 

    // all right

    logger.info('Server ready');
    this.notificationBus.serverReady();
  }
  
  // Prints out an error and aborts the process. 
  // 
  handleStartupFailure(error: mixed) {
    const logger = this.logger; 
    errors.errorHandling.logError(error, null, logger);
    
    process.exit(1);
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

