// @flow

// Load configuration file, set up execution context and start the server. 

const logComponent = require('components/utils').logging;
const business = require('components/business');
const storage = require('components/storage');

const Context = require('./context');
const Settings = require('./Settings');
const Server = require('./server'); 

import type { LogFactory, Logger } from 'components/utils/src/logging';

// const { Tags } = require('opentracing');
const opentracing = require('opentracing');
const initTracer = require('jaeger-client').initTracer;

const { patch } = require('./tracing/mongodb_client');

function createSettings(): Settings {
  try {
    return Settings.load(); 
  } catch(err) {
    if (err.code == 'ENOENT') {
      console.error('Configuration file not found. '     // eslint-disable-line no-console
        + 'Default location is \'./hfs-server.json\'. '
        + 'Use --config to modify expected location.');
      process.exit(1);
      // NOT REACHED
    }
    
    throw err; 
  }
}
function createLogFactory(settings): LogFactory {
  const logSettings = settings.get('logs').obj();
  return logComponent(logSettings).getLogger;
}
function createContext(settings: Settings, logFactory: LogFactory): Context {
  const host = settings.get('influxdb.host').str(); 
  const port = settings.get('influxdb.port').num();
  
  const influx = new business.series.InfluxConnection(
    {host: host, port: port}, logFactory('influx')); 
  
  const mongo = new storage.Database(
    settings.get('mongodb').obj(), logFactory('database'));
    
  const tracer = produceTracer(settings, logFactory('jaeger'));
  
  const typeRepoUpdateUrl = settings.get('eventTypes.sourceURL').str();
    
  return new Context(influx, mongo, logFactory, tracer, typeRepoUpdateUrl);
}

// Produce a tracer that allows creating span trees for a subset of all calls. 
// 
function produceTracer(settings, logger) {
  if (! settings.get('trace.enable').bool()) 
    return new opentracing.Tracer();
    
  const traceConfig = {
    'serviceName': 'hfs-server',
    'reporter': {
      'logSpans': true,
      'agentHost': settings.get('trace.agent.host').str(),
      'agentPort': settings.get('trace.agent.port').num(), 
      'flushIntervalMs': settings.get('trace.sampler.flushIntervalMs').num(),
    },
    'logger': logger,
    'sampler': {
      'type': settings.get('trace.sampler.type').str(),
      'param': settings.get('trace.sampler.param').num(),
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
  settings: Settings; 
  logFactory: LogFactory; 
  context: Context; 
    
  server: Server; 
  
  init(settings?: Settings): Application {
    this.settings = settings || createSettings(); 
    this.logFactory = createLogFactory(this.settings);
    
    this.context = createContext(this.settings, this.logFactory);

    this.server = new Server(this.settings, this.context);
    
    return this; 
  }
  
  start(): Application {
    this.server.start(); 
    
    return this; 
  }
  
  run() {
    this.init(); 
    this.start(); 
  }
}

module.exports = Application; 
