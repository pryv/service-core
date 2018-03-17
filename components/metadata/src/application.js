// @flow

// Main application class. Does all the work. 

const assert = require('assert');

const loggingSubsystem = require('components/utils/src/logging');

const Settings = require('./settings');

import type { Logger, LogFactory } from 'components/utils/src/logging';

class Application {
  logFactory: LogFactory;
  logger: Logger; 
  settings: Settings;
  
  constructor() {
    this.initSettings(); 
    this.initLogger(); 
    this.initTrace(); 
    
    assert(this.logger != null);
    assert(this.settings != null);
  }
    
  initSettings() {
    this.settings = new Settings(); 
  }
  initLogger() {
    const settings = this.settings;
    const loggerSettings = settings.getLogSettingsObject();
    const logFactory = this.logFactory = loggingSubsystem(loggerSettings).getLogger;
    
    this.logger = logFactory('application');
  }
  initTrace() {
    
  }
  
  // Runs the application. This method only ever exits once the service is 
  // killed. 
  // 
  run() {    
    const logger = this.logger; 
    logger.info('Metadata service is starting...');
  }
}

module.exports = Application;