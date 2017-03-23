// @flow
'use strict';

var winston = require('winston'),
    airbrake = null;

// setup logging levels (match logging methods below)
const levels = Object.freeze({
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
  let consoleSettings = winston['default'].transports.console;
  consoleSettings.silent = ! logsSettings.console.active;
  if (logsSettings.console.active) {
    consoleSettings.level = logsSettings.console.level;
    consoleSettings.colorize = logsSettings.console.colorize;
    consoleSettings.timestamp = logsSettings.console.timestamp || true;
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

  var loggers: Map<string, Logger> = new Map(),
      prefix = logsSettings.prefix;
  return {
    /**
     * Returns a logger for the given component. Keeps track of initialized
     * loggers to only use one logger per component name.
     *
     * @param {String} componentName
     */
    getLogger: function (componentName: string): Logger {
      const context = prefix + componentName;
      
      // Return memoized instance if we have produced it before.
      const existingLogger = loggers.get(context);
      if (existingLogger) return existingLogger;
      
      // Construct a new instance. We're passing winston as a logger here. 
      const logger = new Logger(context, winston);
      loggers.set(context, logger);
      
      return logger; 
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
function Logger(context, winstonLogger) {
  this.messagePrefix = context ? '[' + context + '] ' : '';
  this.winstonLogger = winstonLogger;
}

// define logging methods
Object.keys(levels).forEach(function (level) {
  Logger.prototype[level] = function (message, metadata) {
    const msg = this.messagePrefix + message;
    this.winstonLogger[level](msg, metadata || {});
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
