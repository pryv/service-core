// @flow

// Main service class for the Metadata Updater Service. 

import type { Logger } from 'components/utils/src/logging';


class Service {
  logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger; 
  }
  
  
  async start() {
    const logger = this.logger; 
    
    logger.info('starting...');
  }
}

module.exports = Service;