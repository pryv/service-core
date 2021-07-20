/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');
const {getConfig, getLogger } = require('@pryv/boiler').init({
  appName: 'previews-server',
  baseConfigDir: path.resolve(__dirname, '../../api-server/config'), // api-server config
  extraConfigs: [{
    scope: 'defaults-previews',
    file: path.resolve(__dirname, '../config/defaults-config.yml')
  }, {
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    scope: 'defaults-paths',
    file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
  }, {
    plugin: require('api-server/config/components/systemStreams')
  }]
});

// @flow
const http = require('http');

const middleware = require('middleware');
const storage = require('storage');
const utils = require('utils');
const { axonMessaging } = require('messages');

const ExtensionLoader = utils.extension.ExtensionLoader;

import type { Extension } from 'utils';

function loadCustomAuthStepFn(customExtensions): ?Extension {
  const defaultFolder = customExtensions.defaultFolder;
  const customAuthStepFnPath = customExtensions.customAuthStepFn;

  const loader = new ExtensionLoader(defaultFolder);

  if (customAuthStepFnPath != null && customAuthStepFnPath !== '')
    return loader.loadFrom(customAuthStepFnPath);

  return loader.load('customAuthStepFn');
}

async function start() {
  /**
   * Runs the server.
   * Launch with `node server [options]`.
   */

  // load config settings
  var config = await getConfig();

  const customAuthStepExt = loadCustomAuthStepFn(config.get('customExtensions'));

  const logger = getLogger('server');

  const database = await storage.getDatabase();

  const storageLayer = await storage.getStorageLayer();

  const initContextMiddleware = middleware.initContext(
    storageLayer,
    customAuthStepExt && customAuthStepExt.fn);

  const loadAccessMiddleware = middleware.loadAccess(
    storageLayer);

  const { expressApp, routesDefined } = require('./expressApp')(
    await middleware.commonHeaders(), 
    require('./middleware/errors')(logger), 
    middleware.requestTrace(null, logger));

  // setup routes
  require('./routes/index')(expressApp);
  require('./routes/event-previews')(expressApp, initContextMiddleware, loadAccessMiddleware, storageLayer.events, storageLayer.eventFiles, logger);

  // Finalize middleware stack: 
  routesDefined();

  // setup HTTP

  const server: ExtendedAttributesServer = http.createServer(expressApp);
  module.exports = server;

  // Go

  axonMessaging.openPubSocket(config.get('tcpMessaging'), function (err, pubSocket) {
    if (err) {
      logger.error('Error setting up TCP pub socket: ' + err);
      process.exit(1);
    }
    logger.info('TCP pub socket ready on ' + config.get('tcpMessaging:host') + ':' +
      config.get('tcpMessaging:port'));

    database.waitForConnection(function () {
      const backlog = 512;
      server.listen(config.get('http:port'), config.get('http:ip'), backlog, function () {
        var address = server.address();
        var protocol = server.key ? 'https' : 'http';
        server.url = protocol + '://' + address.address + ':' + address.port;
        const infostr =  'Preview server v' + require('../package.json').version +
        ' [' + expressApp.settings.env + '] listening on ' + server.url;
        logger.info(infostr);

        // all right
        logger.debug(infostr)
        logger.info('Server ready');
        pubSocket.emit('server-ready');
      });
    });
  });

  process.on('exit', function () {
    logger.info('Browser server exiting.');
  });
}

type ExtendedAttributesServer = net$Server & {
  key?: string,
  url?: string,
}

const loggerLaunch = getLogger('launch');

// And now:
start()
  .catch(err => {
    loggerLaunch.error(err, err); // eslint-disable-line no-console
  });

