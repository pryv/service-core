// @flow

// Main application class. Does all the work. 

const assert = require('assert');

const yargs = require('yargs');

const loggingSubsystem = require('components/utils/src/logging');

const Settings = require('./settings');

import type { Logger, LogFactory } from 'components/utils/src/logging';

const services = {
  MetadataUpdater: require('./metadata_updater/service'),
};

class Application {
  logFactory: LogFactory;
  logger: Logger; 
  settings: Settings;
  
  metadataUpdaterService: ?services.MetadataUpdater;
  
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
    
    this.logger = logFactory('application');
  }
  initTrace() {
    // TODO
  }
  async parseCommandLine(argv: Array<string>) {
    const cliArgs = new CLIArgs(this.settings, this.logger); 
    await cliArgs.parse(argv);
  }
  
  // Runs the application. This method only ever exits once the service is 
  // killed. 
  // 
  async run() {    
    const logger = this.logger; 
    const settings = this.settings;
        
    const host = settings.get('metadataUpdater.host').str(); 
    const port = settings.get('metadataUpdater.port').num(); 
    const endpoint = `${host}:${port}`;
    
    logger.info('Metadata service is starting...');
    await this.startMetadataUpdater(endpoint); 
  }
  
  // Initializes and starts the metadata updater service. The `endpoint`
  // parameter should contain an endpoint the service binds to in the form of
  // HOST:PORT.  
  // 
  async startMetadataUpdater(endpoint: string) {
    const lf = this.logFactory;
    const service = new services.MetadataUpdater(lf('metadata_updater')); 
    this.metadataUpdaterService = service; 
    
    await service.start(endpoint);
  }
}

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
      .usage('$0 [args] \n\n  starts a metadata service')
      .help();      
    
    const out = cli.parse(argv);
    
    if (out.config != null) 
      await this.parseConfigFile(out.config);
  }
  
  async parseConfigFile(path: string) {
    const settings = this.settings; 

    await settings.loadFromFile(path);
    
    // NOTE Done after the fact, because maybe 'info' is only visible after
    // configuration.
    console.info(`Using configuration file at: ${path}`); // eslint-disable-line no-console
  }
}

module.exports = Application;