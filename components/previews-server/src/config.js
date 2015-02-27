var config = require('components/utils').commonConfig,
    path = require('path'),
    _ = require('lodash');

/**
 * Extends common config.
 */
module.exports = config;

_.extend(config.defaults, {
  auth: {
    /**
     * The maximum age of a personal access token if unused.
     */
    sessionMaxAge: 1000 * 60 * 60 * 24 * 14 // 2 weeks
  },
  eventFiles: {
    attachmentsDirPath: path.join(__dirname, '../../../../service-core-files/attachments'),
    previewsDirPath: path.join(__dirname, '../../../../service-core-files/previews'),
    previewsCacheMaxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    previewsCacheCleanUpCronTime: '00 00 2 * * *' // every day at 2:00:00AM
  },
  /**
   * Override common default settings.
   */
  logs: {
    console: {
      active: true,
      level: 'debug',
      colorize: true
    },
    file: {
      active: false,
      level: 'error',
      path: 'browser-server.log',
      maxFileBytes: 4096,
      maxNbFiles: 20
    },
    airbrake: {
      active: false,
      key: 'test-airbrake-key'
    }
  },
  tcpMessaging: {
    host: 'localhost',
    port: '2002',
    pubConnectInsteadOfBind: false
  }
});
