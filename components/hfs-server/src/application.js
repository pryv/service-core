/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const path = require('path');
const { getConfig, getLogger } = require('@pryv/boiler').init({
  appName: 'hfs-server',
  baseFilesDir: path.resolve(__dirname, '../../../'),
  baseConfigDir: path.resolve(__dirname, '../config'),
  extraConfigs: [
    {
      scope: 'serviceInfo',
      key: 'service',
      urlFromKey: 'serviceInfoUrl'
    },
    {
      scope: 'defaults-paths',
      file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
    },
    {
      scope: 'defaults-data',
      file: path.resolve(__dirname, '../config/default-config.yml')
    },
    {
      plugin: require('api-server/config/components/systemStreams')
    }
  ]
});
// Load configuration file, set up execution context and start the server.
const Context = require('./context');
const Server = require('./server');
const setCommonMeta = require('api-server/src/methods/helpers/setCommonMeta');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const opentracing = require('opentracing');
const initTracer = require('jaeger-client').initTracer;
/**
 * @returns {Promise<any>}
 */
async function createContext (config) {
  const logger = getLogger('setup');
  const pluginLoader = require('storages/pluginLoader');
  await pluginLoader.init(config);
  const engine = pluginLoader.getEngineFor('seriesStorage');
  const engineModule = pluginLoader.getEngineModule(engine);

  let influx;
  if (engineModule.createSeriesConnection) {
    influx = await engineModule.createSeriesConnection({
      host: config.has('influxdb:host') ? config.get('influxdb:host') : undefined,
      port: config.has('influxdb:port') ? config.get('influxdb:port') : undefined
    });
  } else {
    throw new Error(`Engine "${engine}" does not support seriesStorage.`);
  }

  const tracer = produceTracer(config, getLogger('jaeger'));
  const typeRepoUpdateUrl = config.get('service:eventTypes');
  const context = new Context(influx, tracer, typeRepoUpdateUrl, config);
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
/**
 * @returns {any}
 */
function produceTracer (config, logger) {
  if (!config.get('trace:enable')) { return new opentracing.Tracer(); }
  const traceConfig = {
    serviceName: 'hfs-server',
    reporter: {
      logSpans: true
    },
    logger,
    sampler: {
      type: 'const',
      param: 1
    }
  };
  const tracer = initTracer(traceConfig);
  return tracer;
}
// The HF application holds references to all subsystems and ties everything
// together.
//

class Application {
  logger;

  context;

  server;

  config;
  /**
   * @returns {Promise<void>}
   */
  async init () {
    this.logger = getLogger('application');
    this.config = await getConfig();
    await SystemStreamsSerializer.init();
    await setCommonMeta.loadSettings();
    this.context = await createContext(this.config);
    this.server = new Server(this.config, this.context);
  }

  /**
   * @returns {Promise<Application>}
   */
  async start () {
    await this.server.start();
    return this;
  }

  /**
   * @returns {Promise<void>}
   */
  async run () {
    await this.init();
    await this.start();
  }
}
module.exports = Application;
