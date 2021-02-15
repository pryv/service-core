/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Standalone script to perform cache cleanup.
 * Expects settings to be passed the same way as for the main server.
 */

const path = require('path');
const { getConfigUnsafe, getLogger }  = require('@pryv/boiler').init({
  appName: 'previews-cache-clean',
  baseConfigDir: path.resolve(__dirname, '../../api-server/config'), // api-server config
  extraConfigs: [{
    scope: 'defaults-previews',
    file: path.resolve(__dirname, '../config/defaults-config.yml')
  },{
    scope: 'defaults-data',
    file: path.resolve(__dirname, '../../api-server/config/defaults.js')
  }, {
    plugin: require('../../api-server/config/components/systemStreams')
  }]
});

const Cache = require('./cache.js');
const errorHandling = require('errors').errorHandling;

const logger = getLogger('previews-cache-worker');
const settings = getConfigUnsafe(true).get('eventFiles');

const cache = new Cache({
  rootPath: settings.previewsDirPath,
  maxAge: (settings.previewsCacheMaxAge / 1000 || 60 * 60 * 24 * 7) / 1000, // 1w
  logger
});

logger.info('Starting clean-up in ' + settings.previewsDirPath);
cache.cleanUp()
  .then(() => {
    logger.info('Clean-up successful.');
    process.exit(0);
  })
  .catch(err => {
    errorHandling.logError(err, null, logger);
    process.exit(1);
  });
