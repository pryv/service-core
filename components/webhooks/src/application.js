/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 

const path = require('path');
require('@pryv/boiler').init({
  appName: 'webhooks',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    plugin: require('api-server/config/components/systemStreams')
  }]
});

const {getConfig, getLogger} = require('@pryv/boiler');

const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const assert = require('assert');

const storage = require('storage');

const services = {
  WebhooksService: require('./service'),
};

class Application {
  logger;
  settings;

  webhooksService;

  async setup() {
    await this.initSettings();
    this.initLogger();

    assert(this.logger != null);
    assert(this.settings != null);
    this.logger.debug('setup done');
  }

  async initSettings() {
    this.settings = await getConfig();
    await SystemStreamsSerializer.init();
  }
  initLogger() {
    this.logger = getLogger('application');
  }

  async run() {
    const logger = this.logger;

    logger.info('Webhooks service is mounting services');
    const settings = this.settings;

    // Connect to MongoDB
    const storageLayer = await storage.getStorageLayer()

    // Construct the service
    const service = new services.WebhooksService({
      storage: storageLayer,
      logger: getLogger('webhooks_service'),
      settings: settings
    });
    this.webhooksService = service;
    logger.info('run() done');
    // And start it.
    await service.start();
  }

  stop() {
    return this.webhooksService.stop();
  }

}
module.exports = Application;