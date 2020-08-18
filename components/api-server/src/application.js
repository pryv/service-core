/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// A central registry for singletons and configuration-type instances; pass this
// to your code to give it access to app setup. 

const utils = require('components/utils');
const storage = require('components/storage');
const API = require('./API');
const expressAppInit = require('./expressApp');

import type { ConfigAccess } from './settings';
import type { WebhooksSettingsHolder } from './methods/webhooks';
import type { LogFactory } from 'components/utils';
import type { Logger } from 'components/utils';
import type { ExpressAppLifecycle } from './expressApp';

type UpdatesSettingsHolder = {
  ignoreProtectedFields: boolean,
}

// Application is a grab bag of singletons / system services with not many 
// methods of its own. It is the type-safe version of DI. 
// 
class Application {
  // Application settings, see ./settings
  settings: ConfigAccess; 
  
  logging: Logger

  // Application log factory
  logFactory: LogFactory; 
  
  // Normal user API
  api: API; 
  // API for system routes. 
  systemAPI: API; 
  
  database: storage.Database;

  // Storage subsystem
  storageLayer: storage.StorageLayer;
  
  expressApp: express$Application;

  lifecycle: ExpressAppLifecycle;
  
  constructor(settings: ConfigAccess) {
    this.settings = settings;
    
    this.api = new API(); 
    this.systemAPI = new API(); 
    
    this.produceLogSubsystem(); 
    this.produceStorageSubsystem(); 
  }

  async initiate() {
    await this.createExpressApp();
    this.initiateRoutes();
  }

  async createExpressApp(): Promise<[express$Application, ExpressAppLifecycle]> {
    const {expressApp, lifecycle} = await expressAppInit( 
      this.settings.get('dnsLess.isActive').bool(), 
      this.logging);
    this.expressApp = expressApp;
    this.lifecycle = lifecycle;
    
    // Make sure that when we receive requests at this point, they get notified 
    // of startup API unavailability. 
    lifecycle.appStartupBegin(); 
  }

  initiateRoutes() {
    const isOpenSource = this.settings.get('openSource.isActive').bool();
    if (isOpenSource) {
      require('../../www')(this.expressApp, this);
    }

    require('./routes/auth/register')(this.expressApp, this);

    // system and root MUST come first
    require('./routes/system')(this.expressApp, this);
    require('./routes/root')(this.expressApp, this);
    
    require('./routes/accesses')(this.expressApp, this);
    require('./routes/account')(this.expressApp, this);
    require('./routes/auth/login')(this.expressApp, this);
    require('./routes/auth/register')(this.expressApp, this);
    require('./routes/events')(this.expressApp, this);
    require('./routes/followed-slices')(this.expressApp, this);
    require('./routes/profile')(this.expressApp, this);
    require('./routes/service')(this.expressApp, this);
    require('./routes/streams')(this.expressApp, this);

    if(!isOpenSource) require('./routes/webhooks')(this.expressApp, this);
  }
  
  produceLogSubsystem() {
    const settings = this.settings;
    const logSystemSettings = this.settings.get('logs').obj();
    this.logging = utils.logging(logSystemSettings); 
    
    this.logFactory = this.logging.getLogger;
  }

  produceStorageSubsystem() {
    const settings = this.settings;

    this.database = new storage.Database(
      settings.get('database').obj(), 
      this.logFactory('database'));

    // 'StorageLayer' is a component that contains all the vertical registries
    // for various database models. 
    this.storageLayer = new storage.StorageLayer(this.database, 
      this.logFactory('model'),
      settings.get('eventFiles.attachmentsDirPath').str(), 
      settings.get('eventFiles.previewsDirPath').str(), 
      settings.get('auth.passwordResetRequestMaxAge').num(), 
      settings.get('auth.sessionMaxAge').num(), 
      settings.get('systemStreams.account').obj(), 
    );
  }
  
  // Returns the settings for updating entities
  // 
  getUpdatesSettings(): UpdatesSettingsHolder {
    const settings = this.settings;
    
    return {
      ignoreProtectedFields: settings.get('updates.ignoreProtectedFields').bool(),
    };
  }

  getWebhooksSettings(): WebhooksSettingsHolder {
    const settings = this.settings;
    return settings.get('webhooks').obj();
  }
  
  getServiceInfoSettings(): ConfigAccess {
    return this.settings;
  }

  // Produces and returns a new logger for a given `topic`.
  // 
  getLogger(topic: string): Logger {
    return this.logFactory(topic);
  }
}

module.exports = Application;
