// @flow

// Main service class for the Metadata Updater Service. 

const rpc = require('components/tprpc');

const definitionFactory = require('./definition');
const { PendingUpdatesMap, PendingUpdate } = require('./pending_updates');
const { Controller } = require('./controller');

import type { Logger } from 'components/utils/src/logging';
import type { IMetadataUpdaterService, IUpdateRequests, IUpdateResponse, 
  IUpdateId, IPendingUpdate } from './interface';
  
import type { StorageLayer } from 'components/storage';

// The metadata updater service receives 'scheduleUpdate' rpc messages on the
// tchannel/protobuf3 interface (from the network). It then flushes these
// updates every N ms to MongoDB.   
// 
class Service implements IMetadataUpdaterService {
  db: StorageLayer;
  logger: Logger;
  
  // Underlying transport and RPC dispatcher
  server: rpc.Server;
  
  // Where we store incoming work, this is shared between this class and the
  // controller.
  pending: PendingUpdatesMap; 
  
  // Controller for work done in this service. 
  controller: Controller;
  
  constructor(db: StorageLayer, logger: Logger) {
    this.db = db;
    this.logger = logger; 
    
    this.server = new rpc.Server(); 

    this.pending = new PendingUpdatesMap(); 
    this.controller = new Controller(db, this.pending, logger);
  }
  
  // Starts the service, including all subprocesses.
  // 
  async start(endpoint: string) {
    const logger = this.logger; 
    const server = this.server; 
    const controller = this.controller;
    
    logger.info(`starting... (@ ${endpoint})`);
    const definition = await definitionFactory.produce();
    server.add(
      definition, 'MetadataUpdaterService', 
      (this: IMetadataUpdaterService));
    await server.listen(endpoint);
    logger.info('started.');
    
    const runEachMs = 500;
    logger.info(`Will flush every ${runEachMs}ms.`);
    controller.runEach(runEachMs);
  }
  
  // --------------------------------------------------- IMetadataUpdaterService
  
  async scheduleUpdate(req: IUpdateRequests): Promise<IUpdateResponse> {
    const pending = this.pending; 
    const logger = this.logger; 
    
    logger.info(`scheduleUpdate: ${req.entries.length} updates.`);
    
    for (const entry of req.entries) {
      logger.info(`scheduleUpdate/entry: ${entry.userId}.${entry.eventId}: [${entry.dataExtent.from}, ${entry.dataExtent.to}]`);
      
      const now = new Date() / 1e3;
      const update = PendingUpdate.fromUpdateRequest(now, entry);
      pending.merge(update);
      
    }
    
    return {};
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