/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const util = require('util');
const winston = require('winston');
const debugModule = require('debug');
let winstonInstance = null;
let rootLogger = null;

// ------ winston formating

/**
 * 
 * @param {Object} options 
 * @param {boolean} options.color - set to true to have colors
 * @param {boolean} options.time - set to true to for timestamp
 * @param {boolean} options.align - set to true to allign logs items
 */
function generateFormat(options) {
  const formats = [];
  if (options.color) {
    formats.push(winston.format.colorize());
  } 
  if (options.time) {
    formats.push(winston.format.timestamp());
  }
  if (options.align) {
    formats.push(winston.format.align());
  }

  function printf(info) {
    const {
      timestamp, level, message, ...args
    } = info;
    
    let items = info[Symbol.for('splat')] || {};
    
    let itemStr = '';
    if (items.length > 0) {
      if (items.length === 1 && items[0]) {
        if (items[0].context) { 
          items = items[0].context;
        } 
      }
      itemStr = util.inspect(items, {depth: 10, colors: true});
    }



    const line = `[${level}]: ${message} ${itemStr}`;

    if (options.time) {
      const ts = timestamp.slice(0, 19).replace('T', ' ');
      return ts + ' ' + line;
    } else {
      return line;
    }
  }
  formats.push(winston.format.printf(printf));
  return winston.format.combine(...formats);
}



/**
 * Helper to pass log instructions to winston
 */
function globalLog(level, text, context) { 
  if (winstonInstance) {
    winstonInstance[level](text, context);
  } else {
    console.log('Logger not initialized: ', ...arguments);
  }
}


/**
 * Config initialize Logger right after beeing loaded
 * This is done by config Only
 */ 
async function initLoggerWithConfig(config) { 
  if (winstonInstance) {
    throw new Error("Logger was already initialized");
  }
  // console
  winstonInstance = winston.createLogger({ });
  const logConsole = config.get('logs:console');
  if (logConsole.active) {
    rootLogger.debug('Console active with level: ', logConsole.level);
    const format = generateFormat(logConsole.format)
    const myconsole = new winston.transports.Console({ format: format , level: logConsole.level});
    winstonInstance.add(myconsole);
  }

  // file
  const logFile = config.get('logs:file');
  if (logFile.active) {
    rootLogger.debug('File active: ' + logFile.path);
    const files = new winston.transports.File({ 
      filename: logFile.path,
      level: logFile.level,
      maxsize: logFile.maxFileBytes,
      maxFiles: logFile.maxNbFiles,
      timestamp: true,
      json: false
    });
    winstonInstance.add(files);
  }
  rootLogger.debug('Logger Initialized');
};



// --------------- debug utils 

/**
 * Dump objects with file and line
 */
function inspect() {
  let line = '';
  try {
    throw new Error();
  } catch (e) {
    line = e.stack.split(' at ')[2].trim();
  }
  let res = '\n * dump at: ' + line;
  for (var i = 0; i < arguments.length; i++) {
    res += '\n' + i + ' ' + util.inspect(arguments[i], true, 10, true) + '\n';
  }
  return res;
};


function setGlobalName(name) {
  // create root logger
  rootLogger = new Logger(name, null);
  rootLogger.debug('setGlobalName: ' + name);
}


class Logger {
  parent; // eventual parent
  debugInstance; // debug instance

  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this.debugInstance =  debugModule(this._name());
  }
  /**
   * Private
   */
  _name() {
    if (this.parent) return this.parent._name() + ':' + this.name;
    return this.name;
  }

  log() {
    const level = arguments[0];
    const text = '[' + this._name() + ']: ' + hideSensitiveValues(arguments[1]);
    const context = [];
    let meta = null;
    // Security measure: We do not want any sensitive value to appear in logs
    for (let i = 2; i < arguments.length; i++) {
      context.push(inspectAndHide(arguments[i]));
    }
    if (context.length === 1) {
      meta = {context:  context[0]};
    } else if (context.length > 1) {
      meta = {context:  context};
    }
    globalLog(level, text, meta);
  }

  info () { this.log('info', ...arguments); }
  warn () { this.log('warn', ...arguments); }
  error () { this.log('error', ...arguments); }
  debug () { this.debugInstance(...arguments); } 

  /**
   * get a "sub" Logger
   * @param {Logger} name 
   */
  getReggol (name) {
    return new Logger(name, this);
  }

  inspect() { inspect(...arguments); }
}

function getReggol(name) {
  if (! rootLogger) {
    throw new Error('Initalize boiler before using debug')
  }
  if(! name) {
    return rootLogger;
  }
  return rootLogger.getReggol(name);
}

module.exports = {
  getReggol: getReggol,
  setGlobalName: setGlobalName,
  initLoggerWithConfig: initLoggerWithConfig
}

// ----------------- Hide sensite data -------------------- //

function inspectAndHide(o) {
  return _inspectAndHide(JSON.parse(JSON.stringify(o))); // clone and remove circular
}

function _inspectAndHide(o) {
  if (typeof o === 'string') {
    return hideSensitiveValues(o);
  }
  if (o !== null && typeof o === 'object') {
    if (Array.isArray(o)) {
      const res = [];
      for (let item of o) {
        res.push(inspectAndHide(item));
      }
      return res;
    }


    const res = {};
    for (let key of Object.keys(o)) {
      if (['password', 'passwordHash'].includes(key)) {
        res[key] = '(hidden password)';
      } else {
        res[key] = inspectAndHide(o[key]);
      }
    }
    return res;
  }
  return o;
}


// Hides sensitive values (auth tokens and passwords) in log messages
function hideSensitiveValues (msg) {
  const tokenRegexp = /auth\=c([a-z0-9-]*)/g;
  const passwordRegexp = /"(password|passwordHash)"[:=]"([^"]*)"/g;
  const mask = '(hidden)';

  msg = msg
    .replace(tokenRegexp, 'auth='+mask)
    .replace(passwordRegexp, '$1='+mask);
  
  return msg;
}