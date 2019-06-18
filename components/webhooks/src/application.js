// @flow

// Main application class. Does all the work. 

const assert = require('assert');
const yargs = require('yargs');

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

  async setup(overrideSettings: ?Object) {
    this.initSettings();

    await this.parseCommandLine(process.argv);

    if (overrideSettings != null)
      this.settings.merge(overrideSettings);

    this.initLogger();
    this.initTrace();

    assert(this.logger != null);
    assert(this.settings != null);
  }

  initSettings() {
    this.settings = new Settings();
  }
  initLogger() {
    const settings = this.settings;
    const loggerSettings = settings.getLogSettingsObject();
    const logFactory = this.logFactory = loggingSubsystem(loggerSettings).getLogger;

    const logger = this.logger = logFactory('webhooks');

    const consoleLevel = settings.get('logs.console.level').str();
    logger.info(`Console logging is configured at level '${consoleLevel}'`);
  }
  initTrace() {
    // TODO
  }
  async parseCommandLine(argv: Array<string>) {
    const cliArgs = new CLIArgs(this.settings);
    await cliArgs.parse(argv);
  }

  // Runs the application. This method only ever exits once the service is 
  // killed. 
  // 
  async run() {
    const logger = this.logger;

    logger.info('Webhooks service is mounting services');
    await this.startWebhooksService();
  }

  stop(): void {
    return this.webhooksService.stop();
  }

  // Initializes and starts the webhooks service. The `endpoint`
  // parameter should contain an endpoint the service binds to in the form of
  // HOST:PORT.  
  // 
  async startWebhooksService() {
    const settings = this.settings;
    const loggerFor = this.logFactory;

    // Connect to MongoDB
    const storageLayer = produceStorageLayer(
      settings.getMongodbSettings(),
      loggerFor('mongodb')
    );

    // Construct the service
    const service = new services.WebhooksService(storageLayer, loggerFor('webhooks_service'));
    this.webhooksService = service;

    // And start it.
    await service.start();
  }
}
module.exports = Application;

// Handles command line argument parsing and help output. 
// 
class CLIArgs {
  settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  // Parses the configuration on the command line (arguments) and executes 
  // actions against the `settings`.
  // 
  async parse(argv: Array<string>) {
    const cli = yargs
      .option('c', {
        alias: 'config',
        type: 'string',
        describe: 'reads configuration file at PATH'
      })
      .usage('$0 [args] \n\n  starts a webhooks service')
      .help();

    const out = cli.parse(argv);

    if (out.config != null)
      await this.parseConfigFile(out.config);
  }

  async parseConfigFile(input: string) {
    const settings = this.settings;

    const configPath = path.resolve(input);
    await settings.loadFromFile(configPath);

    // NOTE Done after the fact, because maybe 'info' is only visible after
    // configuration.
    console.info(`Using configuration file at: ${configPath}`); // eslint-disable-line no-console
  }
}

function produceStorageLayer(settings, logger) {
  logger.info(`Connecting to MongoDB (@ ${settings.host}:${settings.port}/${settings.name}) (${settings.authUser})`);

  const mongoConn = new storage.Database(
    settings, logger);

  // BUG These must be read from the configuration, probably. If we don't have 
  // these values, we cannot instanciate StorageLayer, even though none of these
  // is used here. So bad. To be changed.
  // 
  const passwordResetRequestMaxAge = 60 * 1000;
  const sessionMaxAge = 60 * 1000;

  const storageLayer = new storage.StorageLayer(
    mongoConn,
    logger,
    'attachmentsDirPath', 'previewsDirPath',
    passwordResetRequestMaxAge,
    sessionMaxAge);

  return storageLayer;
}