/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const { getConfig, getLogger } = require('@pryv/boiler').init({
  appName: 'previews-server',
  baseFilesDir: path.resolve(__dirname, '../../../'),
  baseConfigDir: path.resolve(__dirname, '../../api-server/config'),
  extraConfigs: [
    {
      scope: 'defaults-previews',
      file: path.resolve(__dirname, '../config/defaults-config.yml')
    },
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
      plugin: require('api-server/config/components/systemStreams')
    }
  ]
});
// @flow
const http = require('http');
const middleware = require('middleware');
const storage = require('storage');
const utils = require('utils');
const { axonMessaging } = require('messages');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const ExtensionLoader = utils.extension.ExtensionLoader;
/**
 * @returns {any}
 */
function loadCustomAuthStepFn (customExtensions) {
  const defaultFolder = customExtensions.defaultFolder;
  const customAuthStepFnPath = customExtensions.customAuthStepFn;
  const loader = new ExtensionLoader(defaultFolder);
  if (customAuthStepFnPath != null && customAuthStepFnPath !== '') { return loader.loadFrom(customAuthStepFnPath); }
  return loader.load('customAuthStepFn');
}
/**
 * @returns {Promise<void>}
 */
async function start () {
  /**
   * Runs the server.
   * Launch with `node server [options]`.
   */
  // load config settings
  const config = await getConfig();
  await SystemStreamsSerializer.init();
  const customAuthStepExt = loadCustomAuthStepFn(config.get('customExtensions'));
  const logger = getLogger('server');
  const database = await storage.getDatabase();
  const storageLayer = await storage.getStorageLayer();
  const initContextMiddleware = middleware.initContext(storageLayer, customAuthStepExt && customAuthStepExt.fn);
  const loadAccessMiddleware = middleware.loadAccess(storageLayer);
  const { expressApp, routesDefined } = require('./expressApp')(await middleware.commonHeaders(), require('./middleware/errors')(logger), middleware.requestTrace(null, logger));
  // setup routes
  require('./routes/index')(expressApp);
  await require('./routes/event-previews')(expressApp, initContextMiddleware, loadAccessMiddleware, logger);
  // Finalize middleware stack:
  routesDefined();
  // setup HTTP
  const server = http.createServer(expressApp);
  module.exports = server;
  // Go
  const testNotifier = await axonMessaging.getTestNotifier();
  await database.waitForConnection();
  const backlog = 512;
  server.listen(config.get('http:port'), config.get('http:ip'), backlog, function () {
    const address = server.address();
    const protocol = server.key ? 'https' : 'http';
    server.url = protocol + '://' + address.address + ':' + address.port;
    const infostr = 'Preview server v' +
            require('../package.json').version +
            ' [' +
            expressApp.settings.env +
            '] listening on ' +
            server.url;
    logger.info(infostr);
    // all right
    logger.debug(infostr);
    logger.info('Server ready');
    testNotifier.emit('axon-server-ready');
  });
  process.on('exit', function () {
    logger.info('Browser server exiting.');
  });
}
const loggerLaunch = getLogger('launch');
// And now:
start().catch((err) => {
  loggerLaunch.error(err, err); // eslint-disable-line no-console
});

/**
 * @typedef {Server & {
 *   key?: string;
 *   url?: string;
 * }} ExtendedAttributesServer
 */
