// @flow

// Main application class. Does all the work. 

const assert = require('assert');

const loggingSubsystem = require('components/utils/src/logging');

const Settings = require('./settings');

import type { Logger, LogFactory } from 'components/utils/src/logging';

const services = {
  MetadataUpdater: require('./metadata_updater/service'),
};

class Application {
  logFactory: LogFactory;
  logger: Logger; 
  settings: Settings;
  
  metadataUpdaterService: ?services.MetadataUpdater;
  
  constructor(settings: ?Object) {
    this.initSettings(settings); 
    this.initLogger(); 
    this.initTrace(); 
    
    assert(this.logger != null);
    assert(this.settings != null);
  }
    
  initSettings(settings: ?Object) {
    this.settings = new Settings(settings); 
  }
  initLogger() {
    const settings = this.settings;
    const loggerSettings = settings.getLogSettingsObject();
    const logFactory = this.logFactory = loggingSubsystem(loggerSettings).getLogger;
    
    this.logger = logFactory('application');
  }
  initTrace() {
    // TODO
  }
  
  // Runs the application. This method only ever exits once the service is 
  // killed. 
  // 
  async run() {    
    const logger = this.logger; 
    const settings = this.settings;
    
    const host = settings.get('metadataUpdater.host').str(); 
    const port = settings.get('metadataUpdater.port').num(); 
    const endpoint = `${host}:${port}`;
    
    logger.info('Metadata service is starting...');
    await this.startMetadataUpdater(endpoint); 
  }
  
  // Initializes and starts the metadata updater service. The `endpoint`
  // parameter should contain an endpoint the service binds to in the form of
  // HOST:PORT.  
  // 
  async startMetadataUpdater(endpoint: string) {
    const lf = this.logFactory;
    const service = new services.MetadataUpdater(lf('metadata_updater')); 
    this.metadataUpdaterService = service; 
    
    await service.start(endpoint);
  }
}

module.exports = Application;