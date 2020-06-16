// @flow

// Load configuration file, set up execution context and start the server.

import type { LogFactory } from 'components/utils/src/logging';

const logComponent = require('components/utils').logging;
const business = require('components/business');
const storage = require('components/storage');

const setCommonMeta = require('components/api-server/src/methods/helpers/setCommonMeta');
const opentracing = require('opentracing');
const { initTracer } = require('jaeger-client');
const Context = require('./context');
const Settings = require('./Settings');
const Server = require('./server');

// Initialize ProjectVersion

// const { Tags } = require('opentracing');

const { patch } = require('./tracing/mongodb_client');

async function createSettings(): Promise<Settings> {
  try {
    return await Settings.load();
  } catch (err) {
    if (err.code == 'ENOENT') {
      console.error('Configuration file not found. ' // eslint-disable-line no-console
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
async function createContext(
  settings: Settings, logFactory: LogFactory,
): Promise<Context> {
  const logger = logFactory('setup');

  const host = settings.get('influxdb.host').str();
  const port = settings.get('influxdb.port').num();

  const influx = new business.series.InfluxConnection(
    { host, port }, logFactory('influx'),
  );

  const mongo = new storage.Database(
    settings.get('mongodb').obj(), logFactory('database'),
  );

  const tracer = produceTracer(settings, logFactory('jaeger'));
  const typeRepoUpdateUrl = settings.get('service.eventTypes').str();

  const context = new Context(influx, mongo, logFactory, tracer, typeRepoUpdateUrl, settings);

  if (settings.has('metadataUpdater.host')) {
    const mdHost = settings.get('metadataUpdater.host').str();
    const mdPort = settings.get('metadataUpdater.port').num();
    const metadataEndpoint = `${mdHost}:${mdPort}`;

    logger.info(`Connecting to metadata updater... (@ ${metadataEndpoint})`);

    await context.configureMetadataUpdater(metadataEndpoint);
  }

  return context;
}

// Produce a tracer that allows creating span trees for a subset of all calls.
//
function produceTracer(settings, logger) {
  if (!settings.get('trace.enable').bool()) { return new opentracing.Tracer(); }

  const traceConfig = {
    serviceName: 'hfs-server',
    reporter: {
      logSpans: true,
      agentHost: settings.get('trace.agent.host').str(),
      agentPort: settings.get('trace.agent.port').num(),
      flushIntervalMs: settings.get('trace.sampler.flushIntervalMs').num(),
    },
    logger,
    sampler: {
      type: settings.get('trace.sampler.type').str(),
      param: settings.get('trace.sampler.param').num(),
    },
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

  async init(settings?: Settings) {
    this.settings = settings || await createSettings();
    setCommonMeta.loadSettings(this.settings);
    this.logFactory = createLogFactory(this.settings);

    this.context = await createContext(this.settings, this.logFactory);

    this.server = new Server(this.settings, this.context);
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
