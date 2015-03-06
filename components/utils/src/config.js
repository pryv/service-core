/* jshint -W024 */
var convict = require('convict'),
    fs = require('fs'),
    path = require('path'),
    toString = require('./toString'),
    _ = require('lodash');

var config = module.exports = {};

/**
 * Additional setting format definitions.
 */
var formats = config.formats = {
  logLevel: [ 'debug', 'info', 'warn', 'error' ]
};

/**
 * Base settings schema. Extend at will.
 */
config.schema = {
  env: {
    format: [ 'production', 'development', 'test' ],
    default: 'development',
    doc: 'The application environment.',
    env: 'NODE_ENV'
  },
  config: {
    format: String,
    default: '',
    doc: 'Optional path to a JSON configuration file. If empty, defaults to `config/{env}.json`.'
  },
  configOverrides: {
    format: String,
    default: '',
    doc: 'Optional path to an extra JSON configuration file. ' +
    'Typically used to define confidential settings (e.g. keys, secrets).'
  },
  printConfig: {
    format: Boolean,
    default: false,
    doc: 'If `true`, prints the configuration settings actually used to the console at load time'
  },
  http: {
    ip: {
      format: 'ipaddress',
      default: '127.0.0.1'
    },
    port: {
      format: 'port',
      default: 3000
    }
  },
  database: {
    authUser: {
      format: String,
      default: '',
      doc: 'If empty, no auth is used'
    },
    authPassword: {
      format: String,
      default: ''
    },
    host: {
      format: String,
      default: 'localhost'
    },
    port: {
      format: 'port',
      default: 27017
    },
    name: {
      format: String,
      default: 'pryv-node'
    }
  },
  eventFiles: {
    attachmentsDirPath: {
      format: String,
      default: path.join(__dirname, '../../../../service-core-files/attachments')
    },
    previewsDirPath: {
      format: String,
      default: path.join(__dirname, '../../../../service-core-files/previews')
    }
  },
  auth: {
    filesReadTokenSecret: {
      format: String,
      default: 'OVERRIDE ME',
      doc: 'The secret used to compute tokens for authentifying read accesses of event attachments'
    }
  },
  logs: {
    console: {
      active: {
        format: Boolean,
        default: true
      },
      level: {
        format: formats.logLevel,
        default: 'debug'
      },
      colorize: {
        format: Boolean,
        default: true
      }
    },
    file: {
      active: {
        format: Boolean,
        default: false
      },
      level: {
        format: formats.logLevel,
        default: 'error'
      },
      path: {
        format: String,
        default: 'server.log'
      },
      maxFileBytes: {
        format: 'nat',
        default: 4096
      },
      maxNbFiles: {
        format: 'nat',
        default: 20
      }
    },
    airbrake: {
      active: {
        format: Boolean,
        default: false
      },
      key: {
        format: String,
        default: '',
        doc: 'The Airbrake API key'
      }
    }
  },
  tcpMessaging: {
    host: {
      format: String,
      default: 'localhost'
    },
    port: {
      format: 'port',
      default: 2001
    },
    pubConnectInsteadOfBind: {
      format: Boolean,
      default: false,
      doc: 'Used for tests to reverse the pub-sub init order'
    }
  }
};

/**
 * Loads configuration settings from (last takes precedence):
 *
 *   1. Defaults
 *   2. A file whose path is specified in the setting 'config', defaulting to 'config/{env}.json'
 *   3. An "overrides" file whose path is specified in the setting 'configOverrides'
 *   4. Environment variables
 *   5. Command-line arguments
 *
 * Note: possible output is printed to the console (logging is not yet setup at this point).
 *
 * @param configDefault An optional override default value for option `config`
 * @returns {Object} The loaded settings
 */
config.load = function (configDefault) {
  autoSetEnvAndArg(this.schema);

  var instance = convict(this.schema);

  var filePath = instance.get('config') ||
                 configDefault ||
                 'config/' + instance.get('env') + '.json';
  loadFile(filePath);

  var overridesFilePath = instance.get('configOverrides');
  if (overridesFilePath) {
    loadFile(overridesFilePath);
  }

  instance.validate();

  var settings = instance.get();

  if (settings.printConfig) {
    print('Configuration settings loaded', settings);
  }

  return settings;

  function loadFile(fPath) {
    if (! fs.existsSync(fPath)) {
      console.error('Could not load config file ' + toString.path(fPath) + '');
    } else {
      instance.loadFile(fPath);
    }
  }
};

config.printSchemaAndExitIfNeeded = function () {
  process.argv.slice(2).forEach(function (arg) {
    if (arg === '--help') {
      autoSetEnvAndArg(this.schema);
      print('Available configuration settings', this.schema);
      process.exit(0);
    }
  }.bind(this));
};

function autoSetEnvAndArg(schema, context) {
  context = context || [];
  Object.keys(schema).forEach(function (key) {
    var value = schema[key],
        keyPath = context.concat(key);
    if (isSettingDefinition(value)) {
      value.env = value.env || getSettingEnvName(keyPath);
      value.arg = value.arg || getSettingArgName(keyPath);
    } else if (_.isObject(value)) {
      autoSetEnvAndArg(value, keyPath);
    }
  });
}

function isSettingDefinition(obj) {
  return obj.hasOwnProperty('default');
}

function getSettingEnvName(keyPath) {
  var envKeyPath = ['Pryv'].concat(keyPath);
  return envKeyPath.map(function (s) {
    return s.toUpperCase();
  }).join('_');
}

function getSettingArgName(keyPath) {
  return keyPath.join(':');
}

function print(title, data) {
  console.log(title + ':\n' + JSON.stringify(data, null, 2));
}
