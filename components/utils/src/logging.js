var winston = require('winston'),
    airbrake = null;

// setup logging levels (match logging methods below)
var levels = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
});
winston.setLevels(levels);
winston.addColors({
  debug: 'blue',
  info: 'green',
  warn: 'yellow',
  error: 'red'
});

/**
 * Returns a logging singleton providing component-specific loggers.
 * (I.e. wrapper around Winston prefixing log messages with per-component prefixes.)
 *
 * @param logsSettings
 */
module.exports = function (logsSettings) {
  // apply settings

  // (console transport is present by default)
  var console = winston['default'].transports.console;
  console.silent = logsSettings.console &&
      ! isTrue(logsSettings.console.active);
  if (logsSettings.console && isTrue(logsSettings.console.active)) {
    console.level = logsSettings.console.level || 'debug';
    console.colorize = logsSettings.console.colorize || false;
    console.timestamp = ! isFalse(logsSettings.console.timestamp);
  }
  if (winston['default'].transports.file) {
    // in production env it seems winston already includes a file transport...
    winston.remove(winston.transports.File);
  }
  if (logsSettings.file && isTrue(logsSettings.file.active)) {
    winston.add(winston.transports.File, {
      level: logsSettings.file.level || 'error',
      filename: logsSettings.file.path || 'api-server.log',
      maxsize: logsSettings.file.maxFileBytes || 4096,
      maxFiles: logsSettings.file.maxNbFiles || 20,
      timestamp: true,
      json: false
    });
  }
  if (logsSettings.airbrake && isTrue(logsSettings.airbrake.active)) {
    airbrake = require('airbrake').createClient(logsSettings.airbrake.key);
    airbrake.handleExceptions();
  }

  // return singleton

  var loggers = {};
  return {
    /**
     * Returns a logger for the given component.
     * Keeps track of initialized loggers to only use one logger per component name.
     *
     * @param {String} componentName
     */
    getLogger: function (componentName) {
      if (! loggers[componentName]) {
        loggers[componentName] = new Logger(componentName);
      }
      return loggers[componentName];
    }
  };
};
module.exports.injectDependencies = true; // make it DI-friendly

/**
 * Work around the lack of boolean parsing in command-line arguments.
 */
function isTrue(settingValue) {
  return settingValue === true || settingValue === 'true';
}
function isFalse(settingValue) {
  return settingValue === false || settingValue === 'false';
}

/**
 * Creates a new logger for the given component.
 *
 * @param {String} componentName
 * @constructor
 */
function Logger(componentName) {
  this.messagePrefix = componentName ? '[' + componentName + '] ' : '';
}

// define logging methods
Object.keys(levels).forEach(function (level) {
  Logger.prototype[level] = function (message, metadata) {
    return winston[level](this.messagePrefix + message, metadata || {});
  };
});

Logger.prototype.sendToErrorService = function (error, callback) {
  if (! airbrake) {
    if (typeof(callback) === 'function') {
      callback(null, null);
    }
    return;
  }
  airbrake.notify(error, callback);
};

Logger.prototype.isValidLevel = function (level) {
  return levels.hasOwnProperty(level);
};
