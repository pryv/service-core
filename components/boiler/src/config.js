/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

/**
 * Load configuration in the following order (1st prevails)
 * 
 * .1 'test' -> empty, used by test to override any other config parameter
 * .2 'argv' -> Loaded from arguments
 * .3 'env' -> Loaded from environement variables
 * .4 'base' -> Loaded from ${process.env.NODE_ENV}-config.yaml (if present) or --config parameter
 * .5 and next -> Loaded from extras 
 * .end 
 *  . 'default-file' -> Loaded from ${baseDir}/default-config.yaml 
 *  . 'defaults' -> Hard coded defaults for logger
 */

const fs = require('fs');
const path = require('path');

const nconf = require('nconf');
nconf.formats.yaml = require('./lib/nconf-yaml');

const superagent = require('superagent');


/**
 * Default values for Logger
 */
const defaults = {
  logs: {
    console: {
      active: true,
      level: 'info',
      format: {
        color: true,
        time: true,
        aligned: true
      }
    },
    file: {
      active: true,
      path: 'application.log'
    }
  }
};



/**
 * Config manager
 */
class Config {
  store;
  logger;
  extraAsync;
  baseConfigDir;
  learnDirectory;
  appName;

  constructor() {
    this.extraAsync = [];
  }

  /**
   * @private
   * Init Config with Files should be called just once when starting an APP
   * @param {Object} options
   * @param {string} appName
   * @param {string} [learnDirectory] - (optional) if set, all .get() calls will be tracked in this files in this directory
   * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs (default, env)
   * @param {Array<ConfigFile|ConfigPlugin|ConfigData|ConfigRemoteURL|ConfigRemoteURLFromKey>} [options.extras] - (optional) and array of extra files or plugins to load (synchronously or async)
   * @param {Object} logging
   * @returns {Config} this
   */
  initSync(options, logging) {
    this.appName = options.appName;
    this.learnDirectory = options.learnDirectory;
    const logger = this.logger = logging.getLogger('config');
    const store = this.store = new nconf.Provider();

    const baseConfigDir = this.baseConfigDir = options.baseConfigDir || process.cwd();
    logger.debug('Init with baseConfigDir: ' + baseConfigDir);

    store.use('memory');

    // 1. put a 'test' store up in the list that could be overwitten afterward and override other options
    // override 'test' store with store.add('test', {type: 'literal', store: {....}});
    store.use('test', { type: 'literal', store: {} });

    // get config from arguments and env variables
    // memory must come first for config.set() to work without loading config files
    // 2. `process.env`
    // 3. `process.argv`
    store.argv({parseValues: true}).env({parseValues: true});
    
    // 4. Values in `${NODE_ENV}-config.yaml` or from --config parameter
    let configFile;
    if (store.get('config')) {
      configFile = store.get('config')
    } else if (store.get('NODE_ENV')) {
      configFile = path.resolve(baseConfigDir, store.get('NODE_ENV') + '-config.yaml');
    } 
    if (configFile) {
      loadFile('base', configFile);
    } else {
      // book 'base' slot 
      store.use('base', { type: 'literal', store: {} });
      logger.debug('Booked [base] empty as no --config or NODE_ENV was set');
    }

    // load extra config files & plugins
    if (options.extras) {
      for (let extra of options.extras) { 
        if (extra.file) {
          loadFile(extra.scope, extra.file);
          continue;
        }
        if (extra.plugin) {
          const name = extra.plugin.load(store);
          logger.debug('Loaded plugin: ' + name + ' ' + extra.plugin.load.then);
          continue;
        }
        if (extra.data) {
          const conf = extra.key ? {[extra.key]: extra.data} : extra.data;
          store.use(extra.scope, { type: 'literal', store: conf });
          logger.debug('Loaded [' + extra.scope + '] from DATA: ' + (extra.key ? ' under [' + extra.key + ']' : ''));
          continue;
        }
        if (extra.url || extra.urlFromKey || extra.fileAsync) {
          // register scope in the chain to keep order of configs
          store.use(extra.scope, { type: 'literal', store: {} });
          logger.debug('Booked [' + extra.scope +'] for async Loading ');
          this.extraAsync.push(extra);
          continue;
        }
        if (extra.pluginAsync) {
          logger.debug('Added 1 plugin for async Loading ');
          this.extraAsync.push(extra);
          continue;
        }
        logger.warn('Unkown extra in config init', extra);
      }
    }


    // .end-1 load default and custom config from configs/default-config.json
    loadFile('default-file', path.resolve(baseConfigDir, 'default-config.yaml'));
    
    // .end load hard coded defaults
    store.defaults(defaults);
    
    // init Logger 
    logging.initLoggerWithConfig(this);
    return this;

    // --- helpers --/

    function loadFile(scope, filePath) {

      if (fs.existsSync(filePath)) {
       
        if (filePath.endsWith('.js')) {  // JS file
          const conf = require(filePath);
          store.use(scope, { type: 'literal', store: conf });
        } else {   // JSON or YAML
          const options = { file: filePath }
          if (filePath.endsWith('.yaml')) { options.format = nconf.formats.yaml }
          store.file(scope, options);
        }

        logger.debug('Loaded [' + scope + '] from file: ' + filePath)
      } else {
        logger.debug('Cannot find file: ' + filePath + ' for scope [' + scope + ']');
      }
    }
  }

  async initASync() {
    const store = this.store;
    const logger = this.logger;
    const baseConfigDir = this.baseConfigDir;

    async function loadUrl(scope, key, url) {
      if (typeof url === 'undefined' || url === null) {
          logger.warn('Null or Undefined Url for [' + scope +']');
          return;
      }

      let res = null;
      if (isFileUrl(url)) {
        res = loadFromFile(url);
      } else {
        res = await loadFromUrl(url);
      }
      const conf = key ? {[key]: res} : res;
      store.add(scope, { type: 'literal', store: conf });
      logger.debug('Loaded [' + scope + '] from URL: ' + url + (key ? ' under [' + key + ']' : ''));
    }

    // load remote config files
    for (let extra of this.extraAsync) { 
      if (extra.url) {
        await loadUrl(extra.scope, extra.key, extra.url);
        continue;
      } 
      if (extra.urlFromKey) {
        const url = store.get(extra.urlFromKey);
        await loadUrl(extra.scope, extra.key, url);
        continue;
      }

      if (extra.pluginAsync) {
        const name = await extra.pluginAsync.load(store);
        logger.debug('Loaded async plugin: ' + name);
        continue;
      }

      if (extra.fileAsync) {
        const filePath = path.resolve(baseConfigDir, extra.fileAsync);

        if (! fs.existsSync(filePath)) {
          logger.warn('Cannot find file: ' + filePath + ' for scope [' + extra.scope + ']');
          continue;
        }
        if (! filePath.endsWith('.js')) {
          logger.warn('Cannot only load .js file: ' + filePath + ' for scope [' + extra.scope + ']');
          continue;
        }
        
        const conf = await require(filePath)();
        store.add(extra.scope, { type: 'literal', store: conf });
        
        logger.debug('Loaded in scope [' + extra.scope + ']async .js file: ' + filePath);
      }
    }

    logger.debug('Config fully Loaded');
    return this;
  }

  /**
   * Return true if key as value
   * @param {string} key 
   * @returns {boolean}
   */
  has(key) {
    if (! this.store) { throw(new Error('Config not yet initialized'))}
    const value = this.store.get(key);
    return (typeof value !== 'undefined');
  }

  /**
   * Retreive value
   * @param {string} key 
   */
  get(key) {
    if (! this.store) { throw(new Error('Config not yet initialized'))}
    learn(this.appName, this.learnDirectory, key);
    const value = this.store.get(key);
    if (typeof value === 'undefined') this.logger.debug('get: [' + key +'] is undefined');
    return value;
  }

  /**
   * Set value
   * @param {string} key 
   * @param {Object} value
   */
  set(key, value) {
    if (! this.store) { throw(new Error('Config not yet initialized'))}
    this.store.set(key, value);
  }

  /**
   * Inject Test Config and override any other option
   * @param {Object} configObject;
   */
  injectTestConfig(configObject) {
    this.replaceScopeConfig('test', configObject);
  }

  /**
   * Replace a scope config set
   * @param {string} scope;
   * @param {Object} configObject;
   */
  replaceScopeConfig(scope, configObject) {
    if (! this.store) { throw(new Error('Config not yet initialized'))}
    this.logger.debug('Replace ['+ scope + '] with: ', configObject);
    this.store.add(scope, {type: 'literal', store: configObject});
  }

}

module.exports = Config;

// --- remote and local json ressource loader ---- //

const FILE_PROTOCOL = 'file://';
const FILE_PROTOCOL_LENGTH = FILE_PROTOCOL.length;

async function loadFromUrl(serviceInfoUrl ) {
  const res = await superagent.get(serviceInfoUrl);
  return res.body;
}

function loadFromFile(fileUrl ) {
  const filePath = stripFileProtocol(fileUrl);

  if (isRelativePath(filePath)) {
    const serviceCorePath = path.resolve(__dirname, '../../../../');
    fileUrl = path.resolve(serviceCorePath, filePath);
    fileUrl = 'file://' + fileUrl;
  } else {
    // absolute path, do nothing.
  }
  const res = JSON.parse(
    fs.readFileSync(stripFileProtocol(fileUrl), 'utf8')
  );
  return res;
}


function isFileUrl(filePath) {
  return filePath.startsWith(FILE_PROTOCOL);
}

function isRelativePath(filePath) {
  return !path.isAbsolute(filePath);
}

function stripFileProtocol(filePath) {
  return filePath.substring(FILE_PROTOCOL_LENGTH);
}

function learn(appName, learnDirectory, key) {
  if (learnDirectory) {
    const caller_line = (new Error()).stack.split('\n')[3]; // get callee name and line 
    const index = caller_line.indexOf("at ");
    str = key + ';' + caller_line.slice(index+3, caller_line.length) + '\n';
    fs.appendFileSync(path.join(learnDirectory, appName + '.csv'), str);
  }
}


/**
 * @typedef ConfigFile
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} file - the config file (.yaml, .json, .js)
 */

 /**
 * @typedef ConfigPlugin
 * @property {Object} plugin 
 * @property {Function} plugin.load - a function that takes the "nconf store" as argument and returns the "name" of the plugin
 */

 /**
 * @typedef ConfigData
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} [key] - (optional) key to load result of url. If null loaded at root of the config 
 * @property {object} data - the data to load


/**
 * @typedef ConfigRemoteURL
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} [key] - (optional) key to load result of url. If null loaded at root of the config 
 * @property {string} url - the url to the config definition 
 */
/**
 * @typedef ConfigRemoteURLFromKey
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} [key] - (optional) key to load result of url. If null override 
 * @property {string} urlFromKey - retrieve url from config matching this key
 */
