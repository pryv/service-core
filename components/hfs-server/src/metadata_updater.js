// @flow

// A client for the MetadataUpdater service in the metadata component. 

const rpc = require('components/tprpc');
const metadata = require('components/metadata');

import type { IMetadataUpdaterService, IUpdateResponse } from 'components/metadata';
import type { Logger } from 'components/utils';

async function produceMetadataUpdater(endpoint: string): Promise<IMetadataUpdaterService> {
  const definition = await metadata.updater.definition;
  const client = new rpc.Client(definition);
  return client.proxy('MetadataUpdaterService', endpoint);
}

// A null object that implements the MetadataUpdaterService interface; if no
// connection to an updater is configured in the configuration file, this will
// be used - and no updates will be made. 
// 
class MetadataForgetter implements IMetadataUpdaterService {
  logger: Logger; 
  
  constructor(logger: Logger) {
    this.logger = logger; 
  }
  
  async scheduleUpdate(/* req: IUpdateRequest */): Promise<IUpdateResponse> {
    const logger = this.logger; 
    
    logger.info('Metadata of events will NOT be updated; please configure the metadata update service.');
    
    // Returns the present instant as a deadline, since the operation is 
    // considered complete. 
    return {
      deadline: new Date() * 1e9,
    };
  }
}

module.exports = {
  produce: produceMetadataUpdater, 
  MetadataForgetter
};
