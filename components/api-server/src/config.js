/* jshint -W024 */
var config = require('components/utils').config,
    _ = require('lodash');

/**
 * Extends base config.
 */
module.exports = config;

_.merge(config.schema, {
  nightlyScriptCronTime: {
    format: String,
    default: '00 15 2 * * *' // i.e. every day at 2:15 AM
  },
  eventTypes: {
    sourceURL: {
      format: 'url',
      default: 'https://pryv.github.io/event-types/flat.json'
    }
  },
  audit: {
    forceKeepHistory: {
      format: Boolean,
      default: false,
      doc: 'When true, modification history of items is stored.'
    },
    deletionMode: {
      format: String,
      default: 'keep-nothing',
      doc: 'Defines the behaviour of items deletion.\n' +
      '\'keep-nothing\': Delete history, keep head as itemDeletion as it is now by default.\n' +
      '\'keep-authors\': Keep fields \'headId\', \'id\', \'modified\', \'modifiedBy\'' +
      ' in head and history.\n' +
      '\'keep-everything\': Add \'deleted\' field to head item, leave history as is.'
    }
  },
  auth: {
    // TODO: rename to "systemAccessKey" for consistency
    adminAccessKey: {
      format: String,
      default: 'OVERRIDE ME',
      doc: 'For authorizing admin calls (e.g. user creation from registration server).'
    },
    trustedApps: {
      // TODO: see for custom parsing with convict.addFormat()
      format: String,
      default: '*@http://*.pryv.local*, *@https://*.rec.la*, *@http://pryv.github.io',
      doc: 'Comma-separated list of {trusted-app-id}@{origin} pairs. ' +
           'Origins and app ids accept "*" wildcards, but never use wildcard app ids in production.'
    },
    sessionMaxAge: {
      format: 'duration',
      default: 1000 * 60 * 60 * 24 * 14, // 2 weeks
      doc: 'The maximum age (in seconds) of a personal access token if unused.'
    },
    ssoCookieDomain: {
      format: String,
      default: '',
      doc: 'The domain used to set the SSO cookie, *with* the leading dot if needed ' +
           '(e.g. ".pryv.me"). If empty, the server IP is used.'
    },
    ssoCookieSignSecret: {
      format: String,
      default: 'OVERRIDE ME',
      doc: 'The secret used to sign the SSO cookie to prevent client-side tampering.'
    },
    passwordResetRequestMaxAge: {
      format: 'duration',
      default: 1000 * 60 * 60, // one hour
      doc: 'The maximum age (in seconds) of a password reset request.'
    },
    passwordResetPageURL: {
      format: 'url',
      // TODO: update when simplified env implemented
      default: 'https://sw.pryv.li/access/reset-password.html'
    }
  },
  services: {
    register: {
      url: {
        format: 'url',
        // TODO: update when simplified env implemented
        default: 'https://reg.pryv.in'
      },
      key: {
        format: String,
        default: 'OVERRIDE ME'
      }
    },
    email: {
      enabled: {
        welcome: {
          format: Boolean,
          default: false,
          doc: 'Allows to activate/deactivate the sending of welcome emails.'
        },
        resetPassword: {
          format: Boolean,
          default: false,
          doc: 'Allows to activate/deactivate the sending of password reset emails.'
        }
      },
      welcomeTemplate: {
        format: String,
        default: 'welcome-email'
      },
      resetPasswordTemplate: {
        format: String,
        default: 'reset-password'
      },
      method: {
        format: [ 'mandrill', 'microservice'],
        default: 'mandrill',
        doc: 'Name of the service used to send emails (mandrill or microservice)'
      },
      url: {
        format: 'url',
        default: 'https://mandrillapp.local/api/1.0/messages/send-template.json',
        doc: 'URL of the email delivery service.'
      },
      key: {
        format: String,
        default: 'OVERRIDE ME',
        doc: 'Shared key to authenticate against email service.'
      }
    }
  },
  updates: {
    ignoreProtectedFields: {
      format: Boolean,
      default: false,
      doc: 'When true, updates will ignore protected fields and print a warning log.' +
      'When false, trying to update protected fields will fail with a forbidden error.'
    }
  },
});
