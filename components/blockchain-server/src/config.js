/* jshint -W024 */
var config = require('components/utils').config,
  _ = require('lodash');

/**
 * Extends base config.
 */
module.exports = config;

_.merge(config.schema, {
  'blockchainServer' : {
    http: {
      ip: { 
        default: '127.0.0.1'
      },
      port: { 
        default: 9101
      }
    },
    messages: {
      ip: {
        default: '127.0.0.1'
      },
      port: {
        default: 9102
      }
    },
    logger: {
      error: true
    }
  }
});