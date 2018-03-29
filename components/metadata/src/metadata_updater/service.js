// @flow

// Main service class for the Metadata Updater Service. 

const rpc = require('components/tprpc');

const definitionFactory = require('./definition');
const { PendingUpdatesMap, PendingUpdate } = require('./pending_updates');

import type { Logger } from 'components/utils/src/logging';
import type { IMetadataUpdaterService, IUpdateRequest, IUpdateResponse, 
  IUpdateId, IPendingUpdate } from './interface';

class Service implements IMetadataUpdaterService {
  logger: Logger;
  
  server: rpc.Server;
  
  pending: PendingUpdatesMap; 
  
  constructor(logger: Logger) {
    this.logger = logger; 
    this.server = new rpc.Server(); 
    this.pending = new PendingUpdatesMap(); 
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
    const pending = this.pending; 
    // const logger = this.logger; 
    
    const now = new Date() / 1e3;
    const update = PendingUpdate.fromUpdateRequest(now, req);
    pending.merge(update);
    
    return {
      deadline: 1
    };
  }
  
  async getPendingUpdate(req: IUpdateId): Promise<IPendingUpdate> {
    const pending = this.pending; 
    
    const update = pending.get(PendingUpdate.key(req));

    if (update == null) {
      return {
        found: false, 
        deadline: 0, 
      };
    }
    
    // assert: update != null
    
    return {
      found: true, 
      deadline: update.deadline,
    };
  }
}

module.exports = Service;