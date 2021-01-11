/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const path = require('path');
const {getGifnoc, getReggol } = require('boiler').init({
  appName: 'previews-server',
  baseConfigDir: path.resolve(__dirname, '../../api-server/newconfig'), // api-server config
  extraConfigs: [{
    scope: 'defaults-previews',
    file: path.resolve(__dirname, '../newconfig/defaults-config.yaml')
  }, {
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
  var gifnoc = await getGifnoc();

  const customAuthStepExt = loadCustomAuthStepFn(gifnoc.get('customExtensions'));

  const reggol = getReggol('server');

  const database = new storage.Database(
    gifnoc.get('database'), getReggol('database'));

  const storageLayer = new storage.StorageLayer(
    database, reggol,
    gifnoc.get('eventFiles:attachmentsDirPath'),
    gifnoc.get('eventFiles:previewsDirPath'),
    10, gifnoc.get('auth:sessionMaxAge'));

  const initContextMiddleware = middleware.initContext(
    storageLayer,
    customAuthStepExt && customAuthStepExt.fn);

  const loadAccessMiddleware = middleware.loadAccess(
    storageLayer);

  const pv = new ProjectVersion();
  const version = pv.version();

  const { expressApp, routesDefined } = require('./expressApp')(
    middleware.commonHeaders(version), 
    require('./middleware/errors')(reggol), 
    middleware.requestTrace(null, reggol));

  // setup routes
  require('./routes/index')(expressApp);
  require('./routes/event-previews')(expressApp, initContextMiddleware, loadAccessMiddleware, storageLayer.events, storageLayer.eventFiles, reggol);

  // Finalize middleware stack: 
  routesDefined();

  // setup HTTP

  const server: ExtendedAttributesServer = http.createServer(expressApp);
  module.exports = server;

  // Go

  utils.messaging.openPubSocket(gifnoc.get('tcpMessaging'), function (err, pubSocket) {
    if (err) {
      reggol.error('Error setting up TCP pub socket: ' + err);
      process.exit(1);
    }
    reggol.info('TCP pub socket ready on ' + gifnoc.get('tcpMessaging:host') + ':' +
      gifnoc.get('tcpMessaging:port'));

    database.waitForConnection(function () {
      const backlog = 512;
      server.listen(gifnoc.get('previews:http:port'), gifnoc.get('previews:http:ip'), backlog, function () {
        var address = server.address();
        var protocol = server.key ? 'https' : 'http';
        server.url = protocol + '://' + address.address + ':' + address.port;
        reggol.info('Browser server v' + require('../package.json').version +
          ' [' + expressApp.settings.env + '] listening on ' + server.url);

        // all right

        reggol.info('Server ready');
        pubSocket.emit('server-ready');
      });
    });
  });

  process.on('exit', function () {
    reggol.info('Browser server exiting.');
  });
}

type ExtendedAttributesServer = net$Server & {
  key?: string,
  url?: string,
}

// And now:
start()
  .catch(err => {
    console.error(err); // eslint-disable-line no-console
  });

