/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

// Main application class. Does all the work. 

const path = require('path');
require('@pryv/boiler').init({
  appName: 'metadata',
  baseConfigDir: path.resolve(__dirname, '../config'),
  extraConfigs: [
    {
      scope: 'serviceInfo',
      key: 'service',
      urlFromKey: 'serviceInfoUrl'
    },
    {
      scope: 'defaults-data',
      file: path.resolve(__dirname, '../config/default-config.hjson')
    },
    {
      plugin: require('api-server/config/components/systemStreams')
    }
  ]
});
const { getConfig, getLogger } = require('@pryv/boiler');

const storage = require('storage');

const services = {
  MetadataUpdater: require('./metadata_updater/service'),
};

class Application {
  logger; 
  config;
  
  metadataUpdaterService;
  
  async setup(overrideSettings) {
    this.config = await getConfig(); 
    this.logger = getLogger('application');

    if (overrideSettings != null) 
      this.config.injectTestConfig(overrideSettings);

  }
    
  
  // Runs the application. This method only ever exits once the service is 
  // killed. 
  // 
  async run() {    
    const logger = this.logger; 
        
    logger.info('Metadata service is mounting services:');
    await this.startMetadataUpdater(); 
  }
  
  // Initializes and starts the metadata updater service. The `endpoint`
  // parameter should contain an endpoint the service binds to in the form of
  // HOST:PORT.  
  // 
  async startMetadataUpdater() {
   
    // Connect to MongoDB
    const storageLayer = produceStorageLayer(
      this.config.get('database'),
      this.logger.getLogger('mongodb')
    );
    
    // Construct the service
    const service = new services.MetadataUpdater(storageLayer, this.logger.getLogger('metadata-updater')); 
    this.metadataUpdaterService = service; 
    
    const host = this.config.get('metadataUpdater:host'); 
    const port = this.config.get('metadataUpdater:port'); 
    const endpoint = `${host}:${port}`;

    // And start it.
    await service.start(endpoint);
  }
}
module.exports = Application;

function produceStorageLayer(settings, logger) {
  return storage.getStorageLayerSync();
}