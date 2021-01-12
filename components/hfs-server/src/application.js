/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const path = require('path');
const {getGifnoc, getReggol, boiler} = require('boiler').init({
  appName: 'hfs-server',
  baseConfigDir:  path.resolve(__dirname, '../newconfig'),
  extraConfigs: [{
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../api-server/newconfig/defaults.js')
  }, {
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});


// Load configuration file, set up execution context and start the server. 

const logComponent = require('components/utils').logging;
const business = require('components/business');
const storage = require('components/storage');

const Context = require('./context');
const Server = require('./server'); 

// Initialize ProjectVersion
const setCommonMeta = require('components/api-server/src/methods/helpers/setCommonMeta');

// const { Tags } = require('opentracing');
const opentracing = require('opentracing');
const initTracer = require('jaeger-client').initTracer;

const { patch } = require('./tracing/mongodb_client');

async function createContext(
  gifnoc): Promise<Context> 
{
  const reggol = getReggol('setup');
  
  const host = gifnoc.get('influxdb:host'); 
  const port = gifnoc.get('influxdb:port');
  
  const influx = new business.series.InfluxConnection(
    {host: host, port: port}, getReggol('influx')); 
  
  const mongo = new storage.Database(
    gifnoc.get('database'), getReggol('database'));
    
  const tracer = produceTracer(gifnoc, getReggol('jaeger'));
  const typeRepoUpdateUrl = gifnoc.get('service:eventTypes');
    
  const context = new Context(influx, mongo, getReggol, tracer, typeRepoUpdateUrl, gifnoc);

  if (gifnoc.has('metadataUpdater.host')) {
    const mdHost = gifnoc.get('metadataUpdater:host'); 
    const mdPort = gifnoc.get('metadataUpdater:port'); 
    const metadataEndpoint = `${mdHost}:${mdPort}`;
      
    reggol.info(`Connecting to metadata updater... (@ ${metadataEndpoint})`);
      
    await context.configureMetadataUpdater(metadataEndpoint);
  }
  
  return context;
}

// Produce a tracer that allows creating span trees for a subset of all calls. 
// 
function produceTracer(gifnoc, logger) {
  if (! gifnoc.get('trace:enable')) 
    return new opentracing.Tracer();
    
  const traceConfig = {
    'serviceName': 'hfs-server',
    'reporter': {
      'logSpans': true,
      'agentHost': gifnoc.get('trace:agent:host'),
      'agentPort': gifnoc.get('trace:agent:port'), 
      'flushIntervalMs': gifnoc.get('trace:sampler:flushIntervalMs'),
    },
    'logger': logger,
    'sampler': {
      'type': gifnoc.get('trace:sampler:type'),
      'param': gifnoc.get('trace:sampler:param'),
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
  reggol; 
  context: Context; 
    
  server: Server; 
  gifnoc;
  
  async init(settings?) {
    this.reggol = getReggol('application');
    if (settings) { 
      throw(new Error('Non null settings'));
    }
    this.gifnoc = await getGifnoc();
    await setCommonMeta.loadSettings();

    
    this.context = await createContext(this.gifnoc);

    this.server = new Server(this.gifnoc, this.context);
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
