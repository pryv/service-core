/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
/**
 * Standalone script to perform cache cleanup.
 * Expects settings to be passed the same way as for the main server.
 */

const path = require('path');
const { getConfigUnsafe, getLogger } = require('@pryv/boiler').init({
  appName: 'previews-cache-clean',
  baseFilesDir: path.resolve(__dirname, '../../../'),
  baseConfigDir: path.resolve(__dirname, '../../api-server/config'), // api-server config
  extraConfigs: [{
    scope: 'defaults-previews',
    file: path.resolve(__dirname, '../config/defaults-config.yml')
  }, {
    scope: 'defaults-paths',
    file: path.resolve(__dirname, '../../api-server/config/paths-config.js')
  }, {
    plugin: require('api-server/config/components/systemStreams')
  }]
});

const Cache = require('./cache');
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
