// @flow
'use strict';

var winston = require('winston'),
    airbrake = null;

// setup logging levels (match logging methods below)
var levels = Object.freeze({
  debug: 3,
  info: 2,
  warn: 1,
  error: 0
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
module.exports = function (logsSettings: Object) {
  // apply settings

  // (console transport is present by default)
  var console = winston['default'].transports.console;
  console.silent = ! logsSettings.console.active;
  if (logsSettings.console.active) {
    console.level = logsSettings.console.level;
    console.colorize = logsSettings.console.colorize;
    console.timestamp = logsSettings.console.timestamp || true;
  }
  if (winston['default'].transports.file) {
    // in production env it seems winston already includes a file transport...
    winston.remove(winston.transports.File);
  }
  if (logsSettings.file.active) {
    winston.add(winston.transports.File, {
      level: logsSettings.file.level,
      filename: logsSettings.file.path,
      maxsize: logsSettings.file.maxFileBytes,
      maxFiles: logsSettings.file.maxNbFiles,
      timestamp: true,
      json: false
    });
  }
  if (logsSettings.airbrake.active) {
    airbrake = require('airbrake').createClient(logsSettings.airbrake.key);
    airbrake.handleExceptions();
  }

  // return singleton

  var loggers = {},
      prefix = logsSettings.prefix;
  return {
    /**
     * Returns a logger for the given component. Keeps track of initialized
     * loggers to only use one logger per component name.
     *
     * @param {String} componentName
     */
    getLogger: function (componentName: string): Logger {
      var context = prefix + componentName;
      if (! loggers[context]) {
        loggers[context] = new Logger(context);
      }
      return loggers[context];
    }
  };
};
module.exports.injectDependencies = true; // make it DI-friendly

/**
 * Creates a new logger for the given component.
 *
 * @param {String} context
 * @constructor
 */
function Logger(context) {
  this.messagePrefix = context ? '[' + context + '] ' : '';
}

// define logging methods
Object.keys(levels).forEach(function (level) {
  Logger.prototype[level] = function (message, metadata) {
    return winston[level](this.messagePrefix + message, metadata || {});
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
