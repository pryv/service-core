/**
 * Extends common config with defaults and helpers.
 */

var config = require('components/utils').config,
    path = require('path'),
    _ = require('lodash');

exports = module.exports = config;

_.extend(exports.defaults, {
  nightlyScriptCronTime: '00 15 2 * * *', // i.e. every day at 2:15 AM
  /**
   * Override common default settings.
   */
  eventFiles: {
    attachmentsDirPath: path.join(__dirname, '../../../../../api-server-files/attachments')
  },
  eventTypes: {
    sourceURL: 'http://pryv.github.io/event-types/flat.json'
  },
  auth: {
    /**
     * For authorizing admin calls (e.g. user creation from registration server).
     */
    adminAccessKey: 'test admin key',
    /**
     * Comma-separated list of {trusted-app-id}@{origin} pairs
     * (use via isTrustedApp() function below).
     * Origins accept '*' wildcards.
     * App ids can also equal '*', but obviously don't use that in production settings.
     */
    trustedApps: 'pryv-test@http://*.pryv.local*, *@https://*.rec.la*, *@http://pryv.github.io',
    /**
     * The maximum age of a personal access token if unused.
     */
    sessionMaxAge: 1000 * 60 * 60 * 24 * 14, // 2 weeks
    /**
     * The domain used to set the SSO cookie, *with* the leading dot if needed
     * (e.g. ".pryv.io").
     * If not defined (falsy value, i.e. for tests), the server's local IP is used.
     */
    ssoCookieDomain: '',
    /**
     * The secret used to sign the SSO cookie to prevent client-side tampering.
     */
    ssoCookieSignSecret: 'Hallowed Be Thy Name, O Test',
    /**
     * The secret used to compute tokens for authentifying read accesses of event attachements.
     */
    filesReadTokenSecret: 'test server secret',
    /**
     * The maximum age of a password reset request.
     */
    passwordResetRequestMaxAge: 1000 * 60 * 60, // one hour
    passwordResetPageURL: 'https://sw.pryv.li/access/reset-password.html'
  },
  services: {
    register: {
      url: 'https://reg.pryv.in',
      key: 'test-register-system-key'
    },
    email: {
      url: 'https://mandrillapp.com',
      key: 'test-mandrill-key',
      sendMessagePath: '/api/1.0/messages/send-template.json',
      welcomeTemplate: 'welcome-email',
      resetPasswordTemplate: 'reset-password'
    }
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
      path: 'api-server.log',
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
    port: '2001',
    pubConnectInsteadOfBind: false
  }
});
