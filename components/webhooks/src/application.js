/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const assert = require('assert');

const loggingSubsystem = require('components/utils/src/logging');
const storage = require('components/storage');
const Settings = require('./settings');
import type { Logger, LogFactory } from 'components/utils/src/logging';

const services = {
  WebhooksService: require('components/webhooks/src/service'),
};

class Application {
  logFactory: LogFactory;
  logger: Logger;
  settings: Settings;

  webhooksService: services.WebhooksService;

  async setup() {
    this.initSettings();
    this.initLogger();

    assert(this.logger != null);
    assert(this.settings != null);
  }

  initSettings() {
    this.settings = new Settings();
  }
  initLogger() {
    const settings = this.settings;
    const loggerSettings = settings.get('logs');
    const logFactory = (this.logFactory = loggingSubsystem(
      loggerSettings
    ).getLogger);

    const logger = (this.logger = logFactory('webhooks'));

    const consoleLevel = settings.get('logs.console.level');
    logger.info(`Console logging is configured at level '${consoleLevel}'`);
  }

  async run() {
    const logger = this.logger;

    logger.info('Webhooks service is mounting services');
    const settings = this.settings;

    // Connect to MongoDB
    const storageLayer = produceStorageLayer(
      settings.get('mongodb'),
      this.getLogger('mongodb')
    );

    // Construct the service
    const service = new services.WebhooksService({
      storage: storageLayer,
      logger: this.getLogger('webhooks_service'),
      settings: settings
    });
    this.webhooksService = service;

    // And start it.
    await service.start();
  }

  stop(): void {
    return this.webhooksService.stop();
  }

  // Produces and returns a new logger for a given `topic`.
  //
  getLogger(topic: string): Logger {
    return this.logFactory(topic);
  }
}
module.exports = Application;

function produceStorageLayer(settings, logger) {
  logger.info(`Connecting to MongoDB (@ ${settings.host}:${settings.port}/${settings.name}) (${settings.authUser})`);

  const mongoConn = new storage.Database(
    settings, logger);

  const storageLayer = new storage.StorageLayer(
    mongoConn,
    logger,
  );

  return storageLayer;
}