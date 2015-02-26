/**
 * Standalone script to perform cache cleanup.
 * Expects settings to be passed the same way as for the main server.
 */

var Cache = require('./Cache'),
    errorHandling = require('components/errors').errorHandling,
    utils = require('components/utils');

var settings = require('./config').load(),
    logger = utils.logging(settings.logs).getLogger('previews-cache-worker');
var cache = new Cache({
  rootPath: settings.eventFiles.previewsDirPath,
  maxAge: (settings.eventFiles.previewsCacheMaxAge / 1000 || 60 * 60 * 24 * 7) / 1000 // 1w
});

logger.info('Starting clean-up in ' + settings.eventFiles.previewsDirPath);
cache.cleanUp(function (err) {
  if (err) {
    errorHandling.logError(err, null, logger);
    process.exit(1);
    return;
  }
  logger.info('Clean-up successful.');
  process.exit(0);
});
