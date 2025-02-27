/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const path = require('path');
require('@pryv/boiler').init({
  appName: 'webhooks',
  baseFilesDir: path.resolve(__dirname, '../../../'),
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: [
    {
      scope: 'serviceInfo',
      key: 'service',
      urlFromKey: 'serviceInfoUrl'
    },
    {
      plugin: require('api-server/config/components/systemStreams')
    }
  ]
});
const { getConfig, getLogger } = require('@pryv/boiler');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const assert = require('assert');
const storage = require('storage');
const services = {
  WebhooksService: require('./service')
};

class Application {
  logger;

  settings;

  webhooksService;
  /**
   * @returns {Promise<void>}
   */
  async setup () {
    await this.initSettings();
    this.initLogger();
    assert(this.logger != null);
    assert(this.settings != null);
    this.logger.debug('setup done');
  }

  /**
   * @returns {Promise<void>}
   */
  async initSettings () {
    this.settings = await getConfig();
    await SystemStreamsSerializer.init();
  }

  /**
   * @returns {void}
   */
  initLogger () {
    this.logger = getLogger('application');
  }

  /**
   * @returns {Promise<void>}
   */
  async run () {
    const logger = this.logger;
    logger.info('Webhooks service is mounting services');
    const settings = this.settings;
    // Connect to MongoDB
    const storageLayer = await storage.getStorageLayer();
    // Construct the service
    const service = new services.WebhooksService({
      storage: storageLayer,
      logger: getLogger('webhooks_service'),
      settings
    });
    this.webhooksService = service;
    logger.info('run() done');
    // And start it.
    await service.start();
  }

  /**
   * @returns {void}
   */
  stop () {
    return this.webhooksService.stop();
  }
}
module.exports = Application;
