// @flow

const express = require('express');

const http = require('http');
const childProcess = require('child_process');
const CronJob = require('cron').CronJob;
const bluebird = require('bluebird');
const EventEmitter = require('events');

const utils = require('components/utils');

const Notifications = require('./Notifications');
const Application = require('./application');

import type { Logger } from 'components/utils';
import type { ConfigAccess } from './settings';
import type { ExpressAppLifecycle } from './expressApp';

// Server class for api-server process. To use this, you 
// would 
// 
//    const server = new Server(); 
//    server.start(); 
// 
class Server {
  application: Application;
  settings: ConfigAccess;
  
  logger: Logger; 
  
  // Axon based internal notification and messaging bus. 
  notificationBus: Notifications;
    
  // Load settings and setup base configuration. 
  //
  constructor(application: Application) {
    this.application = application;
    
    const settings = application.settings; 
    this.settings = settings; 

    this.logger = application.logFactory('api-server');
  }
    
  // Start the server. 
  //
  async start() {
    const logger = this.logger;
    
    this.publishExpressMiddleware();
    
    const [expressApp, lifecycle] = this.createExpressApp(); 

    // start TCP pub messaging
    await this.setupNotificationBus();

    // register API methods
    this.registerApiMethods();

    // Setup HTTP and register server; setup Socket.IO.
    const server = http.createServer(expressApp);
    this.setupSocketIO(server); 
    await this.startListen(server);
    
    // Finish booting the server, start accepting connections.
    this.addRoutes(expressApp);
    
    // Let actual requests pass.
    lifecycle.appStartupComplete(); 
    
    await this.setupNightlyScript(server);
    
    logger.info('Server ready.');
    this.notificationBus.serverReady();
  }
  
  createExpressApp(): [express$Application, ExpressAppLifecycle] {
    const app = this.application;
    const dependencies = app.dependencies;

    const {expressApp, lifecycle} = require('./expressApp')(dependencies);
    dependencies.register({expressApp: expressApp});
    
    // Make sure that when we receive requests at this point, they get notified 
    // of startup API unavailability. 
    lifecycle.appStartupBegin(); 
    
    return [expressApp, lifecycle];
  }
  
  // Requires and registers all API methods. 
  // 
  registerApiMethods() {
    const dependencies = this.application.dependencies;

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
  
  // Publishes dependencies for express middleware setup. 
  // 
  publishExpressMiddleware() {
    const dependencies = this.application.dependencies;

    dependencies.register({
      // TODO Do we still need this? Where? Try to eliminate it. 
      express: express, 
    });
  }
  
  setupSocketIO(server: http$Server) {
    const application = this.application; 
    const notificationBus = this.notificationBus;
    const api = application.api; 
    const storageLayer = application.storageLayer;
    const settings = this.settings; 
    const customAuthStepFn = settings.getCustomAuthFunction();
        
    const socketIOsetup = require('./socket-io');
    socketIOsetup(
      server, application.logFactory('socketIO'), 
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
  // You can turn this off! If you set 'tcpMessaging.enabled' to false, nstno axon
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
    const dependencies = this.application.dependencies;
    const notificationEvents = await this.openNotificationBus();
    const bus = this.notificationBus = new Notifications(notificationEvents);
    
    dependencies.register({
      notifications: bus,
    });
  }
  
  // Installs actual routes in express and prints 'Server ready'.
  //
  addRoutes(expressApp: express$Application) {
    const application = this.application;
    const dependencies = application.dependencies;
    
    dependencies.resolve(require('./routes/system'));
    require('./routes/root')(expressApp, application);

    // NOTE We're in the process of getting rid of DI. See above for how these
    // should look once that is done - we're handing each of these route 
    // definers a fixed set of dependencies from which they get to choose. 
    [
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


