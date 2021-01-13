/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Main application class. Does all the work. 

const path = require('path');
require('boiler').init({
  appName: 'metadata',
  baseConfigDir: path.resolve(__dirname, '../../hfs-server/newconfig')
});
const { getConfig, getLogger } = require('boiler');

const storage = require('components/storage');

const services = {
  MetadataUpdater: require('./metadata_updater/service'),
};

class Application {
  logger; 
  config;
  
  metadataUpdaterService: ?services.MetadataUpdater;
  
  async setup(overrideSettings: ?Object) {
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
    const service = new services.MetadataUpdater(storageLayer, this.logger.getLogger('metadata_updater')); 
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
  logger.info(`Connecting to MongoDB (@ ${settings.host}:${settings.port}/${settings.name}) (${settings.authUser})`);
  
  const mongoConn = new storage.Database(settings);
    
  // BUG These must be read from the configuration, probably. If we don't have 
  // these values, we cannot instanciate StorageLayer, even though none of these
  // is used here. So bad. To be changed.
  // 
  const passwordResetRequestMaxAge = 60*1000;
  const sessionMaxAge = 60*1000;
      
  const storageLayer = new storage.StorageLayer(
    mongoConn, 
    logger, 
    'attachmentsDirPath', 'previewsDirPath', 
    passwordResetRequestMaxAge,
    sessionMaxAge);
    
  return storageLayer;
}