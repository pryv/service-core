// @flow

const express = require('express');

const http = require('http');
const childProcess = require('child_process');
const CronJob = require('cron').CronJob;
const dependencies = require('dependable').container({useFnAnnotations: true});
const bluebird = require('bluebird');

const errors = require('components/errors');
const middleware = require('components/middleware');
const storage = require('components/storage');
const utils = require('components/utils');

const Notifications = require('./Notifications');
const API = require('./API');

const config = require('./config');

import type { LogFactory, Logger } from 'components/utils';
import type { ExpressAppLifecycle } from './expressApp';

// GOALS This server setup should - over time - move away
//    from the excessive DI and move towards constructor based
//    DI. (ksc, 28Nov17)

type StorageLayer = {
  versions: storage.Versions,
  passwordResetRequests: storage.PasswordResetRequests,
  sessions: storage.Sessions,
  users: storage.Users,
  accesses: storage.user.Accesses,
  eventFiles: storage.user.EventFiles,
  events: storage.user.Events,
  followedSlices: storage.user.FollowedSlices,
  profile: storage.user.Profile,
  streams: storage.user.Streams,
  
  waitForConnection(): Promise<mixed>, 
}

// Server class for api-server process. To use this, you 
// would 
// 
//    const server = new Server(); 
//    server.start(); 
// 
class Server {
  settings: any; 
  
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
  init() {
    // load config settings
    config.printSchemaAndExitIfNeeded();
    const settings = this.settings = config.load();
    
    const logging = utils.logging(settings.logs); 
    this.logger = logging.getLogger('api-server');
    this.logFactory = logging.getLogger;
    
    this.api = new API(); 
    this.systemAPI = new API(); 
    dependencies.register({
      api: this.api,
      // use separate API instance to avoid any possible security issue
      systemAPI: this.systemAPI 
    });
    
    // register base dependencies (aka global variables)
    dependencies.register({
      // settings
      authSettings: settings.auth,
      auditSettings: settings.audit,
      eventFilesSettings: settings.eventFiles,
      eventTypesSettings: settings.eventTypes,
      httpSettings: settings.http,
      servicesSettings: settings.services,
      customExtensionsSettings: settings.customExtensions,

      // misc utility
      serverInfo: require('../package.json'),
      logging: logging, 
    });

  }
  
  // Setup this.storageLayer.
  //
  setupStorageLayer() {
    const settings = this.settings;

    const database = new storage.Database(
      settings.database, 
      this.logFactory('database'));

    // 'StorageLayer' is a component that contains all the vertical registries
    // for various database models. 
    this.storageLayer = {
      versions: new storage.Versions(
        database, 
        settings.eventFiles.attachmentsDirPath, 
        this.logFactory('versions')),
      passwordResetRequests: new storage.PasswordResetRequests(
        database,{
          maxAge: settings.auth.passwordResetRequestMaxAge }),
      sessions: new storage.Sessions(database, {
        maxAge: settings.auth.sessionMaxAge }),
      users: new storage.Users(database),
      accesses: new storage.user.Accesses(database),
      eventFiles: new storage.user.EventFiles(
        settings.eventFiles, this.logFactory('eventFiles')),
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
  
  // Start the server. This function never returns. 
  //
  async start() {
    try {
      this.init(); 
    }
    catch (err) {
      console.error('Could not parse configuration; Server failed. Please see below for details:'); // eslint-disable-line no-console
      console.log(err); // eslint-disable-line no-console
      process.exit(1);
    }
    
    const logger = this.logger; 
    
    this.setupStorageLayer();

    dependencies.register({
      // Express middleware
      attachmentsAccessMiddleware: middleware.attachmentsAccess,
      initContextMiddleware: middleware.initContext,
      
      express: express, 
    });

    const {app, lifecycle} = require('./expressApp')(dependencies);
    dependencies.register({expressApp: app});

    // start TCP pub messaging
    const axonSocket = await this.openAxonSocket();

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

    // setup web sockets
    dependencies.resolve(require('./sockets/init'));

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
  
  async startListen(server: http$Server, axonSocket: EventEmitter) {
    const settings = this.settings; 
    const http = settings.http; 
    const logger = this.logger; 
    
    const port: number = Number(http.port);
    const hostname: string = http.ip; 
    
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
    if (process.env.NODE_ENV === 'test') {
      try {
        require('components/test-helpers')
          .instanceTestSetup.executeIfAny(settings, axonSocket);
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
    const tcpMessaging = settings.tcpMessaging;

    try {
      const socket = await bluebird.fromCallback(
        (cb) => utils.messaging.openPubSocket(tcpMessaging, cb));
        
      logger.info(`TCP pub socket ready on ${tcpMessaging.host}:${tcpMessaging.port}`);
      this.setupNotificationBus(socket);
      
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
      cronTime: settings.nightlyScriptCronTime || '00 15 2 * * *',
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

