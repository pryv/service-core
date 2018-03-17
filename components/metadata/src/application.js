// @flow

// Main application class. Does all the work. 

const assert = require('assert');

const loggingSubsystem = require('components/utils/src/logging');

import type { Logger, LogFactory } from 'components/utils/src/logging';

class Application {
  logFactory: LogFactory;
  logger: Logger; 
  
  constructor() {
    this.initSettings(); 
    this.initLogger(); 
    this.initTrace(); 
    
    assert(this.logger != null);
  }
    
  initSettings() {
    
  }
  initLogger() {
    const loggerSettings = {};
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