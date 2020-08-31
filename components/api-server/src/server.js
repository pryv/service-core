/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const express = require('express');

const http = require('http');
const bluebird = require('bluebird');
const EventEmitter = require('events');

const utils = require('components/utils');

const Notifications = require('./Notifications');
const Application = require('./application');

const expressAppInit = require('./expressApp');

const child_process = require('child_process');
const url = require('url');

import type { Logger } from 'components/utils';
import type { ConfigAccess } from './settings';


// Server class for api-server process. To use this, you 
// would 
// 
//    const server = new Server(); 
//    server.start(); 
// 
class Server {
  application: Application;
  settings: ConfigAccess;
  isOpenSource: boolean;
  isDNSLess: Boolean;
  logger: Logger; 
  
  // Axon based internal notification and messaging bus. 
  notificationBus: Notifications;
    
  // Load settings and setup base configuration. 
  //
  constructor(application: Application) {
    this.application = application;
    
    const settings = application.settings; 
    this.settings = settings;
    this.isOpenSource = settings.get('openSource.isActive').bool();
    this.isDNSLess = settings.get('dnsLess.isActive').bool();
  }
    
  // Start the server. 
  //
  async start() {
    this.logger = this.application.logFactory('api-server');

    const defaultParam: ?string = this.findDefaultParam();
    if (defaultParam != null) {
      this.logger.error(`Config parameter "${defaultParam}" has a default value, please change it`);
      process.exit(1);
    }
    
    await this.application.initiate();

    // start TCP pub messaging
    await this.setupNotificationBus();

    // register API methods
    this.registerApiMethods();

    // Setup HTTP and register server; setup Socket.IO.
    const server: net$Server = http.createServer(this.application.expressApp);
    this.setupSocketIO(server); 
    await this.startListen(server);

    if (! this.isOpenSource) {
      await this.setupReporting();
    }

    this.logger.info('Server ready.');
    this.notificationBus.serverReady();
  }

  findDefaultParam(): ?string {
    const DEFAULT_VALUES: Array<string> = ['REPLACE_ME'];
    if (DEFAULT_VALUES.includes(this.settings.get('auth.adminAccessKey').str())) return 'auth.adminAccessKey';
    return null;
  }
  
  // Requires and registers all API methods. 
  // 
  registerApiMethods() {
    const application = this.application;
    const l = (topic) => application.getLogger(topic);
    
    require('./methods/system')(application.systemAPI,
      application.storageLayer.accesses, 
      application.settings.get('services').obj(), 
      application.api, 
      application.logging, 
      application.storageLayer, 
      application.settings.get('server').obj());
    
    require('./methods/utility')(application.api, application.logging, application.storageLayer);

    require('./methods/auth/login')(application.api, 
      application.storageLayer.accesses, 
      application.storageLayer.sessions, 
      application.storageLayer.events, 
      application.settings.get('auth').obj());
    
    require('./methods/auth/register')(application.api, 
      application.logging, 
      application.storageLayer, 
      application.settings.get('services').obj(), 
      application.settings.get('server').obj());

    require('./methods/auth/register-singlenode')(application.api, 
      application.logging, 
      application.storageLayer, 
      application.settings.get('services').obj(), 
      application.settings.get('server').obj());

    require('./methods/accesses')(
      application.api, l('methods/accesses'), 
      this.notificationBus, 
      application.getUpdatesSettings(), 
      application.storageLayer);

    require('./methods/service')(
      application.api, l('methods/service'), 
      application.getServiceInfoSettings());

    if (! this.isOpenSource) {
      require('./methods/webhooks')(
        application.api, l('methods/webhooks'),
        application.getWebhooksSettings(),
        application.storageLayer,
      );
    }

    require('./methods/trackingFunctions')(
      application.api,
      l('methods/trackingFunctions'),
      application.storageLayer,
    );

    require('./methods/account')(application.api, 
      application.storageLayer.events, 
      application.storageLayer.passwordResetRequests, 
      application.settings.get('auth').obj(), 
      application.settings.get('services').obj(), 
      this.notificationBus,
      application.logging
    );

    require('./methods/followedSlices')(application.api, application.storageLayer.followedSlices, this.notificationBus);

    require('./methods/profile')(application.api, application.storageLayer.profile);

    require('./methods/streams')(application.api, 
      application.storageLayer.streams, 
      application.storageLayer.events, 
      application.storageLayer.eventFiles, 
      this.notificationBus, 
      application.logging, 
      application.settings.get('audit').obj(), 
      application.settings.get('updates').obj());

    require('./methods/events')(application.api, 
      application.storageLayer.events, 
      application.storageLayer.eventFiles, 
      application.settings.get('auth').obj(), 
      application.settings.get('service.eventTypes').str(), 
      this.notificationBus, 
      application.logging,
      application.settings.get('audit').obj(),
      application.settings.get('updates').obj(), 
      application.settings.get('openSource').obj(), 
      application.settings.get('services').obj());
  }
  
  setupSocketIO(server: net$Server) {
    const application = this.application; 
    const notificationBus = this.notificationBus;
    const api = application.api; 
    const storageLayer = application.storageLayer;
    const settings = this.settings; 
    const customAuthStepFn = settings.getCustomAuthFunction();
    const isOpenSource = this.isOpenSource;
        
    const socketIOsetup = require('./socket-io');
    socketIOsetup(
      server, application.logFactory('socketIO'), 
      notificationBus, api, 
      storageLayer, customAuthStepFn,
      isOpenSource);
  }
  
  // Open http port and listen to incoming connections. 
  //
  async startListen(server: net$Server) {
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
    const protocol = 'http';
    
    const serverUrl = protocol + '://' + address.address + ':' + address.port;
    logger.info(`Core Server (API module) listening on ${serverUrl}`);
    
    // Warning if ignoring forbidden updates
    if (settings.get('updates.ignoreProtectedFields').bool()) {
      logger.warn('Server configuration has "ignoreProtectedFieldUpdates" set to true: ' +
        'This means updates to protected fields will be ignored and operations will succeed. ' +
        'We recommend turning this off, but please be aware of the implications for your code.');
    }


    if (settings.get('deprecated.auth.ssoIsWhoamiActivated').bool()) {
      logger.warn('Server configuration has "ssoIsWhoamiActivated" set to true: ' + 
        'This means that the API method "GET /auth/who-am-i" is activated. ' + 
        'We recommend turning this off as this method might be removed in the next major release.');
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
    const notificationEvents = await this.openNotificationBus();
    const bus = this.notificationBus = new Notifications(notificationEvents);
  }


  async setupReporting() {
    const Reporting = require('lib-reporting');
    async function collectClientData() {
      return {
        userCount: await this.getUserCount()
      };
    }

    const reportingSettings = this.settings.get('reporting').value;
    const templateVersion = reportingSettings.templateVersion;
    const reportingUrl = reportingSettings?.url;
    const optOut = reportingSettings?.optOut;
    const licenseName = reportingSettings.licenseName;
    const role = 'api-server';
    const mylog = function (str) {
      this.logger.info(str);
    }.bind(this);
    new Reporting(licenseName, role, templateVersion, collectClientData.bind(this), mylog, reportingUrl, optOut);
  }

  async getUserCount(): Promise<Number> {
    const eventsStorage = this.application.storageLayer.events;
    let numUsers;
    try{
      numUsers = await bluebird.fromCallback(cb => {
        eventsStorage.count({}, {streamIds: 'username' }, cb);
      });
    } catch(error){
      this.logger.error(error);
      throw error;
    }
    return numUsers;
  }
}
module.exports = Server;
