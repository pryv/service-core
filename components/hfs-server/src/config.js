// @flow

// Our convict configuration that determines the configuration schema. 

const convict = require('convict');
const NATS_CONNECTION_URI = require('components/utils').messaging.NATS_CONNECTION_URI;

function produce() {
  const formats = {
    logLevel: [ 'debug', 'info', 'warn', 'error' ], 
    samplerTypes: ['const', 'probabilistic', 'ratelimiting', 'lowerbound', 'remote']
  };

  return convict({
    serviceInfoUrl: {
      format: String,
      default: undefined,
    },
    config: {
      doc: 'Path to the server configuration file.', 
      format: String, 
      default: 'config/hfs-server.json', 
      arg: 'config', 
    },
    trace: {
      enable: { default: false, format: Boolean },
      agent: {
        host: { default: '127.0.0.1', format: String }, 
        port: { default: 6832, format: Number },
      }, 
      sampler: {
        type: { default: 'const', format: formats.samplerTypes }, 
        param: { default: 1.0, format: Number },
        flushIntervalMs: { default: 5000, format: Number },
      }
    },
    influxdb: {
      host: { format: String, default: 'influxdb' }, 
      port: { format: Number, default: 8086 },
    },
    mongodb: {
      // These should be the production defaults. 
      host:         { format: String, default: 'mongodb' }, 
      port:         { format: Number, default: 27017 }, 
      name:         { format: String, default: 'pryv-node' },
      authUser:     { format: String, default: '' }, 
      authPassword: { format: String, default: '' }, 
    },
    logs: {
      prefix: { default: '', format: String },
      console: {
        active: {
          doc: 'Should the server log to console?',
          format: Boolean, default: true
        },
        level: {
          doc: 'Log level for the console.',
          format: formats.logLevel, default: 'warn'
        },
        colorize: {
          doc: 'Should console output be colorized?',
          format: Boolean, default: true
        }
      },
      file: {
        active: {
          doc: 'Should the server log to a file?',
          format: Boolean, default: false
        },
        level: {
          doc: 'Log level for the log file.',
          format: formats.logLevel, default: 'error'
        },
        path: {
          doc: 'Where is the log file stored?', 
          format: String, default: 'server.log'
        },
        maxFileBytes: { format: 'nat', default: 4096 },
        maxNbFiles: { format: 'nat', default: 20 }
      },
      airbrake: {
        active: {
          doc: 'Should the server log to airbrake?',
          format: Boolean, default: false
        },
        key: {
          doc: 'Airbrake API key.',
          format: String, default: '',
        }
      }
    },
    http: {
      ip: {
        doc: 'IP address to bind the server to.', 
        format: String, default: '127.0.0.1',
      }, 
      port: {
        doc: 'Port to bind to.', 
        format: 'nat', default: 9000, arg: 'http-port'
      }
    }, 
    nats: {
      uri: {
        format: String, default: NATS_CONNECTION_URI
      }
    },
    // HACK: as this loads serviceInfo from the components/utils config, where we test for this value, which is not present
    // as the hfs-config does not extend the utils/config. This leads to a crash
    dnsLess: {
      isActive: {
        format: Boolean, default: false,
      }
    }
  });
}

module.exports = produce;