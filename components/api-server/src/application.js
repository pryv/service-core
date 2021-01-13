/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// A central registry for singletons and configuration-type instances; pass this
// to your code to give it access to app setup. 

const path = require('path');
const boiler = require('boiler').init({
  appName: 'api-server',
  baseConfigDir: path.resolve(__dirname, '../newconfig/'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../newconfig/defaults.js')
  }, {
    plugin: require('../config/components/systemStreams')
  }]
});

const storage = require('components/storage');
const API = require('./API');
const expressAppInit = require('./expressApp');
const middleware = require('components/middleware');
const errorsMiddlewareMod = require('./middleware/errors'); 

const { getGifnoc, getReggol } = require('boiler');
const reggol = getReggol('application');

const { Extension, ExtensionLoader } = require('components/utils').extension;

reggol.debug('Loading app');

import type { CustomAuthFunction } from 'components/model';
import type { WebhooksSettingsHolder } from './methods/webhooks';

type UpdatesSettingsHolder = {
  ignoreProtectedFields: boolean,
}

type AirbrakeSettings = {
  projectId: string, key: string,
};

// Application is a grab bag of singletons / system services with not many 
// methods of its own. It is the type-safe version of DI. 
// 
class Application {
  // new config
  gifnoc;
  gniggol;

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
    reggol.debug('creation');

    this.api = new API(); 
    this.systemAPI = new API(); 
  
    reggol.debug('created');
  }

  async initiate() {
    if (this.initalized) {
      reggol.debug('App was already initialized, skipping');
      return this;
    }
    this.produceLogSubsystem();
    reggol.debug('Init started');

    this.gifnoc = await getGifnoc();
   
    this.produceStorageSubsystem(); 
    await this.createExpressApp();
    this.initiateRoutes();
    this.expressApp.use(middleware.notFound);
    const errorsMiddleware = errorsMiddlewareMod(this.gniggol, createAirbrakeNotifierIfNeeded(this.gifnoc));
    this.expressApp.use(errorsMiddleware);
    reggol.debug('Init done');
    this.initalized = true;
  }

  async createExpressApp(): Promise<express$Application> {

    this.expressApp = await expressAppInit( 
      this.gifnoc.get('dnsLess:isActive'), 
      this.gniggol);
  }

  initiateRoutes() {
    const isOpenSource = this.gifnoc.get('openSource:isActive');
    if (isOpenSource) {
      require('components/www')(this.expressApp, this);
      require('components/register')(this.expressApp, this);
    }
    if (this.gifnoc.get('dnsLess:isActive')) {
      require('./routes/register')(this.expressApp, this);
    }

    // system, root, register and delete MUST come firs
    require('./routes/auth/delete')(this.expressApp, this);
    require('./routes/auth/register')(this.expressApp, this);
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

    if(!isOpenSource) require('./routes/webhooks')(this.expressApp, this);
  }
  
  produceLogSubsystem() {
    this.gniggol = getReggol('Application'); 
  }

  produceStorageSubsystem() {
    const gifnoc = this.gifnoc;
    this.database = new storage.Database(gifnoc.get('database'));

    // 'StorageLayer' is a component that contains all the vertical registries
    // for various database models. 
    this.storageLayer = new storage.StorageLayer(this.database, 
      getReggol('model'),
      gifnoc.get('eventFiles:attachmentsDirPath'), 
      gifnoc.get('eventFiles:previewsDirPath'), 
      gifnoc.get('auth:passwordResetRequestMaxAge'), 
      gifnoc.get('auth:sessionMaxAge')
    );
  }
  
  // Returns the settings for updating entities
  // 
  getUpdatesSettings(): UpdatesSettingsHolder {
    return {
      ignoreProtectedFields: this.gifnoc.get('updates:ignoreProtectedFields'),
    };
  }

  getWebhooksSettings(): WebhooksSettingsHolder {
    return this.gifnoc.get('webhooks');
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
    reggol.debug('getCustomAuth from: ' + from + ' => ' + (this.customAuthStepFn !== null), this.customAuthStep);
    return this.customAuthStepFn;
  }

  loadCustomExtension(): ?Extension {
    const defaultFolder = this.gifnoc.get('customExtensions:defaultFolder');
    const name = 'customAuthStepFn';
    const customAuthStepFnPath = this.gifnoc.get('customExtensions:customAuthStepFn');

    const loader = new ExtensionLoader(defaultFolder);
  
    let customAuthStep = null;
    if ( customAuthStepFnPath) {
       reggol.debug('Loading CustomAuthStepFn from ' + customAuthStepFnPath);
       customAuthStep = loader.loadFrom(customAuthStepFnPath);
    } else {
      // assert: no path was configured in configuration file, try loading from 
      // default location:
      reggol.debug('Trying to load CustomAuthStepFn from ' + defaultFolder + '/'+ name + '.js');
      customAuthStep = loader.load(name);
    }
    if (customAuthStep) {
      reggol.debug('Loaded CustomAuthStepFn');
      return customAuthStep.fn;
    } else {
      reggol.debug('No CustomAuthStepFn');
    }
  }

}



function createAirbrakeNotifierIfNeeded(gifnoc) {
  /*
    Quick guide on how to test Airbrake notifications (under logs entry):
    1. Update configuration file with Airbrake information:
        "airbrake": {
         "active": true,
         "key": "get it from pryv.airbrake.io settings",
         "projectId": "get it from pryv.airbrake.io settings"
       }
    2. Throw a fake error in the code (/routes/root.js is easy to trigger):
        throw new Error('This is a test of Airbrake notifications');
    3. Trigger the error by running the faulty code (run a local core)
   */
  const settings = getAirbrakeSettings(gifnoc); 
  if (settings == null) return; 

  const { Notifier } = require('@airbrake/node');

  const airbrakeNotifier = new Notifier({
    projectId: settings.projectId,
    projectKey: settings.key,
    environment: 'production',
  });
  return airbrakeNotifier;
}

function getAirbrakeSettings(gifnoc): ?AirbrakeSettings {
  // TODO Directly hand log settings to this class. 
  const logSettings = gifnoc.get('logs');
  if (logSettings == null) return null; 
  
  const airbrakeSettings = logSettings.airbrake;
  if (airbrakeSettings == null || !airbrakeSettings.active) return null; 
  
  const projectId = airbrakeSettings.projectId;
  const key = airbrakeSettings.key;
  if (projectId == null || key == null) return null; 
  
  return {
    projectId: projectId, 
    key: key,
  };
}

module.exports = Application;
