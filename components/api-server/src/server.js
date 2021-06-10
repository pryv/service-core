/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const http = require('http');
const bluebird = require('bluebird');
const EventEmitter = require('events');

const utils = require('utils');
const { axonMessaging } = require('messages');

const { Notifications } = require('messages');
const { getApplication } = require('api-server/src/application');

const UsersRepository = require('business/src/users/repository');

const { getLogger, getConfig } = require('@pryv/boiler');
const { getAPIVersion } = require('middleware/src/project_version');
let app;
let apiVersion;

// Server class for api-server process. To use this, you 
// would 
// 
//    const server = new Server(); 
//    server.start(); 
// 
class Server {
  isOpenSource: boolean;
  isDnsLess: Boolean;
  logger; 
  config;
  
  // Axon based internal notification and axonMessaging bus. 
  notificationBus: Notifications;
    
  // Load config and setup base configuration. 
  //
  constructor() {
  }
    
  // Start the server. 
  //
  async start() {
    this.logger = getLogger('server');
    this.logger.debug('start initiated');
    const apiVersion = await getAPIVersion();
    
    app = getApplication();
    await app.initiate();
    
    const config = await getConfig(); 
    this.config = config;
   
    this.isOpenSource = config.get('openSource:isActive');
    this.isDnsLess = config.get('dnsLess:isActive');
    const defaultParam = this.findDefaultParam();
    if (defaultParam != null) {
      this.logger.error(`Config parameter "${defaultParam}" has a default value, please change it`);
      process.exit(1);
    }
   
    
    // start TCP pub axonMessaging
    await this.setupNotificationBus();
    
    // register API methods
    await this.registerApiMethods();

    // Setup HTTP and register server; setup Socket.IO.
    const server: net$Server = http.createServer(app.expressApp);
    this.setupSocketIO(server); 
    await this.startListen(server);

    if (! this.isOpenSource) {
      await this.setupReporting();
    }

    this.logger.info('Server ready. API Version: ' + apiVersion);
    this.notificationBus.serverReady();
    this.logger.debug('start completed');
  }

  findDefaultParam(): ?string {
    const DEFAULT_VALUES: Array<string> = ['REPLACE_ME'];
    if (DEFAULT_VALUES.includes(this.config.get('auth:adminAccessKey')))  return 'auth:adminAccessKey';
    return null;
  }
  
  // Requires and registers all API methods. 
  // 
  async registerApiMethods() {
    const l = (topic) => getLogger(topic);
    const config = this.config;
    
    require('./methods/system')(app.systemAPI,
      app.storageLayer.accesses, 
      config.get('services'), 
      app.api, 
      app.logging, 
      app.storageLayer);
    
    require('./methods/utility')(app.api, app.logging, app.storageLayer);

    require('./methods/auth/login')(app.api, 
      app.storageLayer.accesses, 
      app.storageLayer.sessions, 
      app.storageLayer.events, 
      config.get('auth'));
    
    require('./methods/auth/register')(app.api, 
      app.logging, 
      app.storageLayer, 
      config.get('services'));

    require('./methods/auth/delete')(app.api,
      app.logging,
      app.storageLayer,
      config);

    require('./methods/accesses')(
      app.api, 
      this.notificationBus, 
      app.getUpdatesSettings(), 
      app.storageLayer);

    require('./methods/service')(app.api);

    if (! this.isOpenSource) {
      require('./methods/webhooks')(
        app.api, l('methods/webhooks'),
        app.getWebhooksSettings(),
        app.storageLayer,
      );
    }

    require('./methods/trackingFunctions')(
      app.api,
      l('methods/trackingFunctions'),
      app.storageLayer,
    );

    require('./methods/account')(app.api, 
      app.storageLayer.events, 
      app.storageLayer.passwordResetRequests, 
      config.get('auth'), 
      config.get('services'), 
      this.notificationBus,
      app.logging
    );

    require('./methods/followedSlices')(app.api, app.storageLayer.followedSlices, this.notificationBus);

    require('./methods/profile')(app.api, app.storageLayer.profile);

    require('./methods/streams')(app.api, 
      app.storageLayer.streams, 
      app.storageLayer.events, 
      app.storageLayer.eventFiles, 
      this.notificationBus, 
      app.logging, 
      config.get('versioning'), 
      config.get('updates'));

    await require('./methods/events')(app.api, 
      app.storageLayer.events, 
      app.storageLayer.eventFiles, 
      config.get('auth'), 
      config.get('service:eventTypes'), 
      this.notificationBus, 
      app.logging,
      config.get('versioning'),
      config.get('updates'), 
      config.get('openSource'), 
      config.get('services'));
      
    if (! this.isOpenSource) {
      require('audit/src/methods/audit-logs')(app.api)
    }

    this.logger.debug('api method registered');
  }
  
  setupSocketIO(server: net$Server) { 
    const notificationBus = this.notificationBus;
    const api = app.api; 
    const storageLayer = app.storageLayer;
    const config = this.config; 
    const customAuthStepFn = app.getCustomAuthFunction('server.js');
    const isOpenSource = this.isOpenSource;
        
    const socketIOsetup = require('./socket-io');
    socketIOsetup(
      server, getLogger('socketIO'), 
      notificationBus, api, 
      storageLayer, customAuthStepFn,
      isOpenSource);
    this.logger.debug('socket io setup done');
  }
  
  // Open http port and listen to incoming connections. 
  //
  async startListen(server: net$Server) {
    const config = this.config; 
    const logger = this.logger; 
    
    const port = config.get('http:port');
    const hostname = config.get('http:ip'); 
    
    
    // All listen() methods can take a backlog parameter to specify the maximum
    // length of the queue of pending connections. The actual length will be
    // determined by the OS through sysctl config such as tcp_max_syn_backlog
    // and somaxconn on Linux. The default value of this parameter is 511 (not
    // 512).
    const backlog = 511;
    
    // Start listening on the HTTP port. 
    await bluebird.fromCallback(
      (cb) => server.listen(port, hostname, backlog, cb));
    
    const address = server.address();
    const protocol = 'http';
    
    const serverUrl = protocol + '://' + address.address + ':' + address.port;
    logger.debug('listening on ' + serverUrl);
    logger.info(`Core Server (API module) listening on ${serverUrl}`);
    
    // Warning if ignoring forbidden updates
    if (config.get('updates:ignoreProtectedFields')) {
      logger.warn('Server configuration has "ignoreProtectedFieldUpdates" set to true: ' +
        'This means updates to protected fields will be ignored and operations will succeed. ' +
        'We recommend turning this off, but please be aware of the implications for your code.');
    }
    
    // TEST: execute test setup instructions if any
    const instanceTestSetup = config.get('instanceTestSetup') || null; // coerce to null  
    if (process.env.NODE_ENV === 'test' && instanceTestSetup !== null) {
      logger.debug('specific test setup ');
      try {
        const axonSocket = this.notificationBus.axonSocket;
        
        require('test-helpers')
          .instanceTestSetup.execute(instanceTestSetup, axonSocket);
      } catch (err) {
        logger.error(err);
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
  // axonMessaging will be performed. This method returns a plain EventEmitter 
  // instead; allowing a) and c) to work. The power of interfaces. 
  // 
  async openNotificationBus(): EventEmitter {
    const logger = this.logger; 
    const config = this.config; 

    const enabled = config.get('tcpMessaging:enabled');
    if (! enabled) return new EventEmitter(); 
    
    const tcpMessaging = config.get('tcpMessaging');
    const host = config.get('tcpMessaging:host');
    const port = config.get('tcpMessaging:port');
    
    try {
      const socket = await bluebird.fromCallback(
        (cb) => axonMessaging.openPubSocket(tcpMessaging, cb));
        
      logger.debug(`AXON TCP pub socket ready on ${host}:${port}`);
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
  }


  async setupReporting() {
    const Reporting = require('lib-reporting');
    const serviceInfoUrl = this.config.get('serviceInfoUrl');
    async function collectClientData() {
      return {
        userCount: await this.getUserCount(),
        serviceInfoUrl: serviceInfoUrl
      };
    }

    const reportingSettings = this.config.get('reporting');
    const templateVersion = reportingSettings.templateVersion;
    const reportingUrl = (process.env.NODE_ENV === 'test') ? 'http://localhost:4001' : null ;
    const licenseName = reportingSettings.licenseName;
    const role = 'api-server';
    const mylog = function (str) {
      this.logger.info(str);
    }.bind(this);
    new Reporting(licenseName, role, templateVersion, collectClientData.bind(this), mylog, reportingUrl);
  }

  async getUserCount(): Promise<Number> {
    let numUsers;
    try{
      let usersRepository = new UsersRepository(app.storageLayer.events);
      numUsers = await usersRepository.count();
    } catch (error) {
      this.logger.error(error, error);
      throw error;
    }
    return numUsers;
  }
}
module.exports = Server;
