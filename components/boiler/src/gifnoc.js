/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const fs = require('fs');
const path = require('path');

const nconf = require('nconf');
nconf.formats.yaml = require('nconf-yaml');

const superagent = require('superagent');


/**
 * Default values for Logger
 */
const defaults = {
  logger: {
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
      filename: 'application.log'
    }
  }
};



/**
 * Config manager
 */
class Config {
  store;
  logger;

  /**
   * @private
   * Init Config with Files should be called just once when starting an APP
   * @param {Object} options
   * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs
   * @param {Array<ConfigFile|ConfigPlugin>} [options.extraSync] - (optional) and array of extra files or plugins to load (synchronously)
   * @param {Object} gniggol
   * @returns {Config} this
   */
  initSync(options, gniggol) {
    const logger = gniggol.getReggol('config');
    const store = new nconf.Provider();

    const baseConfigDir = options.baseConfigDir || 'config';
    logger.debug('Init with baseConfigDir: ' + baseConfigDir)
    // get config from arguments and env variables
    // memory must come first for config.set() to work without loading config files
    // 1. `process.env`
    // 2. `process.argv`
    store.use('memory').argv().env();
    
    // 3. Values in `config.json`
    let configFile;
    if (store.get('config')) {
      configFile = store.get('config')
    } else if (store.get('NODE_ENV')) {
      configFile = path.join(baseConfigDir, store.get('NODE_ENV') + '-config.yaml');
    }


    function loadFile(scope, filename) {
      if (fs.existsSync(filename)) {
        const options = { file: filename }
        if (filename.endsWith('.yaml')) { options.format = nconf.formats.yaml }
        store.file(scope, options);
        logger.debug('Loaded[' + scope + '] from file: ' + filename)
      } else {
        logger.debug('Cannot find: ' + filename)
      }
    }

    // load default and custom config from configs/default-config.json
    const defaultsFile = path.join(baseConfigDir, 'default-config.yaml');
    loadFile('default', defaultsFile);
    loadFile('custom', configFile);

    console.log(options)
    // load extra config files & plugins
    if (options.extraSync) {
      options.extraSync.forEach((extra) => { 
        if (extra.file) {
          loadFile(extra.scope, extra.file);
        }
        if (extra.plugin) {
          const name = extra.plugin.load(store);
          logger.debug('Loaded plugin: ' + name);
        }
      });
    }

    // add defaults value
    store.defaults(defaults);
    this.store = store;
    this.logger = logger;
    
    // init Logger 
    gniggol.initLoggerWithConfig(this);
    return this;
  }

  async initASync(options) {
    const store = this.store;
    const logger = this.logger;

    async function loadUrl(scope, key, url) {
      let res = null;
      if (isFileUrl(url)) {
        res = loadFromFile(url);
      } else {
        res = await loadFromUrl(url);
      }
      const conf = key ? {[key]: res} : res;
      store.add(scope, { type: 'literal', store: conf });
      logger.debug('Loaded URL: ' + url + (key ? ' under [' + key + ']' : ''));
    }

    // load remote config files
    if (options.extraAsync) {
      for (let extra of options.extraAsync) { 
        if (extra.url) {
          await loadUrl(extra.scope, extra.key, extra.url);
        } else if (extra.urlFromKey) {
          const url = store.get(extra.urlFromKey);
          await loadUrl(extra.scope, extra.key, url);
        }
        if (extra.plugin) {
          const name = await extra.plugin.load(store);
          logger.debug('Loaded plugin: ' + name);
        }
      }
    }

    return this;
  }

  constructor() {
    
  }

  /**
   * Retreive value
   * @param {string} key 
   */
  get(key) {
    const value = this.store.get(key);
    this.logger.debug('get: [' + key +'] => ' + value);
    return value;
  }

  /**
   * Set value
   * @param {string} key 
   * @param {Object} value
   */
  set(key, value) {
    this.store.set(key, value);
  }
}

const config = new Config();

module.exports = config;

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
  const serviceInfo = JSON.parse(
    fs.readFileSync(stripFileProtocol(fileUrl), 'utf8')
  );
  return serviceInfo;
}


function isFileUrl(serviceInfoUrl) {
  return serviceInfoUrl.startsWith(FILE_PROTOCOL);
}

function isRelativePath(filePath) {
  return !path.isAbsolute(filePath);
}

function stripFileProtocol(filePath) {
  return filePath.substring(FILE_PROTOCOL_LENGTH);
}

