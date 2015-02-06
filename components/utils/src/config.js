var nconf = require('nconf'),
    fs = require('fs'),
    path = require('path'),
    toString = require('./toString');

/**
 * Default settings. Extend at will.
 */
exports.defaults = {
  http: {
    ip: '127.0.0.1',
    port: 3443,
    noSSL: false, // SSL is on by default,
    certsPathAndKey: path.join(__dirname, '../../cert/rec.la') // will add file suffixes
  },
  database: {
    /**
     * If `null`, no auth is used.
     */
    authUser: null,
    authPassword: null,
    host: 'localhost',
    port: 27017,
    name: 'pryv-node'
  },
  eventFiles: {
    attachmentsDirPath: path.join(__dirname, '../../../../api-server-files/attachments'),
    previewsDirPath: path.join(__dirname, '../../../../api-server-files/previews')
  },
  auth: {
    /**
     * The secret used to compute tokens for authentifying read accesses of event attachements.
     */
    filesReadTokenSecret: 'per-environment server secret'
  },
  logs: {
    console: {
      active: true,
      level: 'debug',
      colorize: true
    },
    file: {
      active: false,
      level: 'error',
      path: 'TBD.log',
      maxFileBytes: 4096,
      maxNbFiles: 20
    },
    airbrake: {
      active: false,
      key: 'to be defined by server instance'
    }
  },
  tcpMessaging: {
    host: 'localhost',
    /**
     * Servers must use their own port here.
     */
    port: '2001',
    /**
     * For tests.
     */
    pubConnectInsteadOfBind: false
  }
};

/**
 * Loads configuration settings from (first takes precedence):
 *
 *   1. Command-line arguments
 *   2. A file whose path is specified in the setting 'config', defaulting to 'config.json'
 *   3. Default settings (`defaults`)
 *
 * @param defaultFilePath An optional default config file path (using if not specified via --config)
 * @returns {Object} The loaded settings
 */
exports.load = function (defaultFilePath) {
  nconf.argv();
  // not used ATM and loads a lot of unwanted mess (that could be white/blacklisted)
  // nconf.env();
  var file = nconf.get('config') || defaultFilePath;
  if (file && ! fs.existsSync(file)) {
    // write error to console: our own logging is not yet setup at this point
    console.error('Cannot find config file ' + toString.path(file));
  }
  nconf.file(file || 'config.json');
  nconf.defaults(this.defaults);

  return nconf.get();
};
