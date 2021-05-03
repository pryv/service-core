/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

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
  }]
});

const storage = require('storage');
const API = require('./API');
const expressAppInit = require('./expressApp');
const middleware = require('middleware');
const errorsMiddlewareMod = require('./middleware/errors'); 

const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('application');
const UserLocalDirectory = require('business').users.UserLocalDirectory;

const { Extension, ExtensionLoader } = require('utils').extension;

logger.debug('Loading app');

import type { CustomAuthFunction } from 'business';
import type { WebhooksSettingsHolder }  from './methods/webhooks';

type UpdatesSettingsHolder = {
  ignoreProtectedFields: boolean,
}

// Application is a grab bag of singletons / system services with not many 
// methods of its own. It is the type-safe version of DI. 
// 
class Application {
  // new config
  config;
  logging;

  initalized;

  
  // Normal user API
  api: API; 
  // API for system routes. 
  systemAPI: API; 
  
  database: storage.Database;

  // Storage subsystem
  storageLayer: storage.StorageLayer;
  
  expressApp: express$Application;

  constructor() {
    this.initalized = false;
    this.isOpenSource = false;
    logger.debug('creation');

    this.api = new API(); 
    this.systemAPI = new API(); 
  
    logger.debug('created');
  }

  async initiate() {
    if (this.initalized) {
      logger.debug('App was already initialized, skipping');
      return this;
    }
    this.produceLogSubsystem();
    logger.debug('Init started');
    await UserLocalDirectory.init();

    this.config = await getConfig();
    this.isOpenSource = this.config.get('openSource:isActive');
    
    if (! this.isOpenSource) {
      const audit = require('audit');
      await audit.init();
    }
    
    this.produceStorageSubsystem(); 
    await this.createExpressApp();
    this.initiateRoutes();
    this.expressApp.use(middleware.notFound);
    const errorsMiddleware = errorsMiddlewareMod(this.logging);
    this.expressApp.use(errorsMiddleware);
    logger.debug('Init done');
    this.initalized = true;
  }

  async createExpressApp(): Promise<express$Application> {

    this.expressApp = await expressAppInit( 
      this.config.get('dnsLess:isActive'), 
      this.logging);
  }

  initiateRoutes() {
    const isOpenSource = this.config.get('openSource:isActive');
    
    if (this.config.get('dnsLess:isActive')) {
      require('./routes/register')(this.expressApp, this);
    }
    
    // system, root, register and delete MUST come first
    require('./routes/auth/delete')(this.expressApp, this);
    require('./routes/auth/register')(this.expressApp, this);
    if (isOpenSource) {
      require('www')(this.expressApp, this);
      require('register')(this.expressApp, this);
    }
    
    require('./routes/system')(this.expressApp, this);
    require('./routes/root')(this.expressApp, this);
    
    require('./routes/accesses')(this.expressApp, this);
    require('./routes/account')(this.expressApp, this);
    require('./routes/auth/login')(this.expressApp, this);
    require('./routes/events')(this.expressApp, this);
    require('./routes/followed-slices')(this.expressApp, this);
    require('./routes/profile')(this.expressApp, this);
    require('./routes/service')(this.expressApp, this);
    require('./routes/streams')(this.expressApp, this);

    
    if(!isOpenSource) {
      require('./routes/webhooks')(this.expressApp, this);
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
  
  // Returns the settings for updating entities
  // 
  getUpdatesSettings(): UpdatesSettingsHolder {
    return {
      ignoreProtectedFields: this.config.get('updates:ignoreProtectedFields'),
    };
  }

  getWebhooksSettings(): WebhooksSettingsHolder {
    return this.config.get('webhooks');
  }

  
   // Returns the custom auth function if one was configured. Otherwise returns
  // null. 
  // 
  customAuthStepLoaded = false;
  customAuthStepFn = null;
  getCustomAuthFunction(from): ?CustomAuthFunction {
    if (! this.customAuthStepLoaded) {
      this.customAuthStepFn = this.loadCustomExtension();
      this.customAuthStepLoaded = true;
    }
    logger.debug('getCustomAuth from: ' + from + ' => ' + (this.customAuthStepFn !== null), this.customAuthStep);
    return this.customAuthStepFn;
  }

  loadCustomExtension(): ?Extension {
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