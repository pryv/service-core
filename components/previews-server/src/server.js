/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');
const {getConfig, getLogger } = require('boiler').init({
  appName: 'previews-server',
  baseConfigDir: path.resolve(__dirname, '../../api-server/config'), // api-server config
  extraConfigs: [{
    scope: 'defaults-previews',
    file: path.resolve(__dirname, '../config/defaults-config.yaml')
  }, {
    scope: 'serviceInfo',
    key: 'service',
    urlFromKey: 'serviceInfoUrl'
  },{
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../api-server/config/defaults.js')
  }, {
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});

// @flow
const http = require('http');

const middleware = require('components/middleware');
const storage = require('components/storage');
const utils = require('components/utils');

const ExtensionLoader = utils.extension.ExtensionLoader;

const { ProjectVersion } = require('components/middleware/src/project_version');

import type { Extension } from 'components/utils';

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

  const database = new storage.Database(
    config.get('database'), getLogger('database'));

  const storageLayer = new storage.StorageLayer(
    database, logger,
    config.get('eventFiles:attachmentsDirPath'),
    config.get('eventFiles:previewsDirPath'),
    10, config.get('auth:sessionMaxAge'));

  const initContextMiddleware = middleware.initContext(
    storageLayer,
    customAuthStepExt && customAuthStepExt.fn);

  const loadAccessMiddleware = middleware.loadAccess(
    storageLayer);

  const pv = new ProjectVersion();
  const version = pv.version();

  const { expressApp, routesDefined } = require('./expressApp')(
    middleware.commonHeaders(version), 
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

  utils.messaging.openPubSocket(config.get('tcpMessaging'), function (err, pubSocket) {
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
    loggerLaunch.error(err); // eslint-disable-line no-console
  });

