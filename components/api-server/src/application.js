/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

// A central registry for singletons and configuration-type instances; pass this
// to your code to give it access to app setup.

const path = require('path');
const boiler = require('@pryv/boiler').init({
  appName: 'api-server',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    scope: 'default-paths',
    file: path.resolve(__dirname, '../config/paths-config.js')
  },{
    plugin: require('../config/components/systemStreams')
  },{
    plugin: require('../config/public-url')
  }, {
    scope: 'default-audit',
    file: path.resolve(__dirname, '../../audit/config/default-config.yml')
  }, {
    scope: 'default-audit-path',
    file: path.resolve(__dirname, '../../audit/config/default-path.js')
  }, {
    plugin: require('../config/config-validation')
  }, {
    plugin: {load: async () => {
      // this is not a plugin, but a way to ensure some component are initialized after config
      // @sgoumaz - should we promote this pattern for all singletons that need to be initialized ?
      const SystemStreamsSerializer = require('business/src/system-streams/serializer');
      await SystemStreamsSerializer.init();
    }}
  }]
});

const storage = require('storage');
const API = require('./API');
const expressAppInit = require('./expressApp');
const middleware = require('middleware');
const errorsMiddlewareMod = require('./middleware/errors');

const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('application');
const userLocalDirectory = require('business').users.userLocalDirectory;


const { Extension, ExtensionLoader } = require('utils').extension;

const { getAPIVersion } = require('middleware/src/project_version');
const { tracingMiddleware } = require('tracing');

logger.debug('Loading app');



// Application is a grab bag of singletons / system services with not many
// methods of its own. It is the type-safe version of DI.
//
class Application {
  // new config
  config;
  logging;

  initalized;
  initializing;


  // Normal user API
  api;
  // API for system routes.
  systemAPI;

  database;

  // Storage subsystem
  storageLayer;

  expressApp;

  isOpenSource;
  isAuditActive;

  constructor() {
    this.initalized = false;
    this.isOpenSource = false;
    this.isAuditActive = false;
    this.initializing = false;
  }

  async initiate() {
    while (this.initializing) { await new Promise(r => setTimeout(r, 50)); }
    if (this.initalized) {
      logger.debug('App was already initialized, skipping');
      return this;
    }
    this.initializing = true;
    this.produceLogSubsystem();
    logger.debug('Init started');


    this.config = await getConfig();
    this.isOpenSource = this.config.get('openSource:isActive');
    this.isAuditActive = (! this.isOpenSource) && this.config.get('audit:active');

    await userLocalDirectory.init();

    if (this.isAuditActive) {
      const audit = require('audit');
      await audit.init();
    }

    this.api = new API();
    this.systemAPI = new API();

    this.produceStorageSubsystem();
    await this.createExpressApp();
    const apiVersion = await getAPIVersion();
    const hostname = require('os').hostname();
    this.expressApp.use(tracingMiddleware(
      'express1',
      {
        apiVersion,
        hostname,
      }
    ))
    await this.initiateRoutes();
    this.expressApp.use(middleware.notFound);
    const errorsMiddleware = errorsMiddlewareMod(this.logging);
    this.expressApp.use(errorsMiddleware);
    logger.debug('Init done');
    this.initalized = true;
    if (this.config.get('showRoutes')) this.helperShowRoutes();
    this.initializing = false;
    return this;
  }

  /**
   * Helps that display all routes and methodId registered
   */
  helperShowRoutes() {
    let route;
    const routes = [];
    function addRoute(route) {
      if (route) {
        let methodId;
        for (let layer of route.stack ) {
          if (layer.handle.name === 'setMethodId') {
            const fakeReq = {};
            layer.handle(fakeReq, null, function() {});
            methodId = fakeReq.context.methodId;
          }
        }
        let keys = Object.keys(route.methods);
        if (keys.length > 1) keys = ['all'];
        routes.push({methodId: methodId, path: route.path, method: keys[0]})
      }
    }

    this.expressApp._router.stack.forEach(function(middleware){
      if(middleware.route){ // routes registered directly on the app
          addRoute(middleware.route);
      } else if(middleware.name === 'router'){ // router middleware
          middleware.handle.stack.forEach(h => addRoute(h.route));
      }
    });
    console.log(routes);
  }

  async createExpressApp() {
    this.expressApp = await expressAppInit(this.logging);
  }

  async initiateRoutes() {

    if (this.config.get('dnsLess:isActive')) {
      require('./routes/register')(this.expressApp, this);
    }

    // system, root, register and delete MUST come first
    require('./routes/auth/delete')(this.expressApp, this);
    require('./routes/auth/register')(this.expressApp, this);
    if (this.isOpenSource) {
      require('www')(this.expressApp, this);
      require('register')(this.expressApp, this);
    }

    require('./routes/system')(this.expressApp, this);
    require('./routes/root')(this.expressApp, this);

    require('./routes/accesses')(this.expressApp, this);
    require('./routes/account')(this.expressApp, this);
    require('./routes/auth/login')(this.expressApp, this);
    await require('./routes/events')(this.expressApp, this);
    require('./routes/followed-slices')(this.expressApp, this);
    require('./routes/profile')(this.expressApp, this);
    require('./routes/service')(this.expressApp, this);
    require('./routes/streams')(this.expressApp, this);


    if(! this.isOpenSource) {
      require('./routes/webhooks')(this.expressApp, this);
    }
    if(this.isAuditActive) {
      require('audit/src/routes/audit.route')(this.expressApp, this);
    }
  }

  produceLogSubsystem() {
    this.logging = getLogger('Application');
  }

  produceStorageSubsystem() {
    this.database = storage.getDatabaseSync();
    // 'StorageLayer' is a component that contains all the vertical registries
    // for various database models.
    this.storageLayer = storage.getStorageLayerSync()
  }

   // Returns the custom auth function if one was configured. Otherwise returns
  // null.
  //
  customAuthStepLoaded = false;
  customAuthStepFn = null;
  getCustomAuthFunction(from) {
    if (! this.customAuthStepLoaded) {
      this.customAuthStepFn = this.loadCustomExtension();
      this.customAuthStepLoaded = true;
    }
    logger.debug('getCustomAuth from: ' + from + ' => ' + (this.customAuthStepFn !== null), this.customAuthStep);
    return this.customAuthStepFn;
  }

  loadCustomExtension() {
    const defaultFolder = this.config.get('customExtensions:defaultFolder');
    const name = 'customAuthStepFn';
    const customAuthStepFnPath = this.config.get('customExtensions:customAuthStepFn');

    const loader = new ExtensionLoader(defaultFolder);

    let customAuthStep = null;
    if ( customAuthStepFnPath) {
      logger.debug('Loading CustomAuthStepFn from ' + customAuthStepFnPath);
      customAuthStep = loader.loadFrom(customAuthStepFnPath);
    } else {
      // assert: no path was configured in configuration file, try loading from
      // default location:
      logger.debug('Trying to load CustomAuthStepFn from ' + defaultFolder + '/'+ name + '.js');
      customAuthStep = loader.load(name);
    }
    if (customAuthStep) {
      logger.debug('Loaded CustomAuthStepFn');
      return customAuthStep.fn;
    } else {
      logger.debug('No CustomAuthStepFn');
    }
  }

}

let app;
/**
 * get Application Singleton
 * @param {boolean} forceNewApp - In TEST mode only, return a new Application for fixtures and mocks
 * @returns
 */
function getApplication(forceNewApp) {
  if (forceNewApp || ! app)  {
    app = new Application();
  }
  return app;
}

module.exports = {
  getApplication
}
