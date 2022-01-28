/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const path = require('path');
const {getConfig, getLogger, boiler} = require('@pryv/boiler').init({
  appName: 'hfs-server',
  baseConfigDir:  path.resolve(__dirname, '../config'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  }, {
    scope: 'defaults-paths',
    file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
  }, {
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../config/default-config.yml')
  }, {
    plugin: require('api-server/config/components/systemStreams')
  }]
});


// Load configuration file, set up execution context and start the server. 

const logComponent = require('utils').logging;
const business = require('business');
const storage = require('storage');

const Context = require('./context');
const Server = require('./server'); 

const setCommonMeta = require('api-server/src/methods/helpers/setCommonMeta');

const opentracing = require('opentracing');
const initTracer = require('jaeger-client').initTracer;

const { patch } = require('./tracing/mongodb_client');

async function createContext(
  config): Promise<Context> 
{
  const logger = getLogger('setup');
  
  const host = config.get('influxdb:host'); 
  const port = config.get('influxdb:port');
  
  const influx = new business.series.InfluxConnection({host: host, port: port}); 
  
  const mongo = await storage.getDatabase();
    
  const tracer = produceTracer(config, getLogger('jaeger'));
  const typeRepoUpdateUrl = config.get('service:eventTypes');
    
  const context = new Context(influx, mongo, tracer, typeRepoUpdateUrl, config);
  await context.init();
  
  if (config.has('metadataUpdater:host')) {
    const mdHost = config.get('metadataUpdater:host'); 
    const mdPort = config.get('metadataUpdater:port'); 
    const metadataEndpoint = `${mdHost}:${mdPort}`;
      
    logger.info(`Connecting to metadata updater... (@ ${metadataEndpoint})`);
      
    await context.configureMetadataUpdater(metadataEndpoint);
  } else {
    logger.info('No Metadata Updater');
  }
  
  return context;
}

// Produce a tracer that allows creating span trees for a subset of all calls. 
// 
function produceTracer(config, logger) {
  if (! config.get('trace:enable')) 
    return new opentracing.Tracer();
  const traceConfig = {
    'serviceName': 'hfs-server',
    'reporter': {
      'logSpans': true,
        },
    'logger': logger,
    'sampler': {
      'type': 'const',
      'param': 1,
    }
  };
  const tracer = initTracer(traceConfig);
  
  // monkey-patch mongodb core driver to also log spans to this tracer. This 
  // works via the 'cls' middleware. Not done when tracing is turned off. 
  patchMongoDBDriver(tracer);

  return tracer; 
}
function patchMongoDBDriver(tracer) {
  patch(tracer);
}

// The HF application holds references to all subsystems and ties everything
// together. 
// 
class Application {
  logger; 
  context: Context; 
    
  server: Server; 
  config;
  
  async init() {
    this.logger = getLogger('application');
    this.config = await getConfig();
    await setCommonMeta.loadSettings();

    
    this.context = await createContext(this.config);

    this.server = new Server(this.config, this.context);
  }
  
  async start(): Promise<Application> {
    await this.server.start(); 
    
    return this; 
  }
  
  async run() {
    await this.init(); 
    await this.start(); 
  }
}

module.exports = Application; 
