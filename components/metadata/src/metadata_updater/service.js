// @flow

// Main service class for the Metadata Updater Service. 

const rpc = require('components/tprpc');

const definitionFactory = require('./definition');

import type { Logger } from 'components/utils/src/logging';
import type { IMetadataUpdaterService, IUpdateRequest, IUpdateResponse } from './interface';

class Service implements IMetadataUpdaterService {
  logger: Logger;
  
  server: rpc.Server;
  
  constructor(logger: Logger) {
    this.logger = logger; 
    this.server = new rpc.Server(); 
  }
  
  async start(endpoint: string) {
    const logger = this.logger; 
    const server = this.server; 
    
    logger.info('starting...');
    const definition = await definitionFactory.produce();
    server.add(
      definition, 'MetadataUpdaterService', 
      (this: IMetadataUpdaterService));
    await server.listen(endpoint);
    logger.info('started.');
  }
  
  async scheduleUpdate(req: IUpdateRequest): Promise<IUpdateResponse> {
    const logger = this.logger; 
    
    logger.info('yes, did something');
    
    req; 
    return {
      deadline: 1
    };
  }
}

module.exports = Service;