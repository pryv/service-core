/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const path = require('path');
require('@pryv/boiler').init({
  appName: 'webhooks',
  baseConfigDir: path.resolve(__dirname, '../config/'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});

const {getConfig, getLogger} = require('@pryv/boiler');

const assert = require('assert');

const storage = require('storage');

const services = {
  WebhooksService: require('./service'),
};

class Application {
  logger;
  settings;

  webhooksService: services.WebhooksService;

  async setup() {
    await this.initSettings();
    this.initLogger();

    assert(this.logger != null);
    assert(this.settings != null);
    this.logger.debug('setup done');
  }

  async initSettings() {
    this.settings = await getConfig();
  }
  initLogger() {
    this.logger = getLogger('application');
  }

  async run() {
    const logger = this.logger;

    logger.info('Webhooks service is mounting services');
    const settings = this.settings;

    // Connect to MongoDB
    const storageLayer = produceStorageLayer(
      settings.get('database'),
      getLogger('database')
    );

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

  stop(): void {
    return this.webhooksService.stop();
  }

}
module.exports = Application;

function produceStorageLayer(settings, logger) {
  logger.info(`Connecting to MongoDB (@ ${settings.host}:${settings.port}/${settings.name}) (${settings.authUser})`);

  const mongoConn = new storage.Database(settings);

  const storageLayer = new storage.StorageLayer(
    mongoConn,
    logger,
  );

  return storageLayer;
}