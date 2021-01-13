/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Gifnoc  = require('./config');
const logging = require('./logging');

const config = new Gifnoc();

const boiler = {
  getLogger: logging.getLogger, 
  getConfig: getConfig,
  init: init,
  config: config 
}

let logger;
let configIsInitalized = false;
let configInitCalledWithName = null;


/**
 * Init Boiler, should be called just once when starting an APP
 * @param {Object} options
 * @param {string} options.appName - the name of the Application used by Logger and debug
 * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs
 * @param {Array<ConfigFile|ConfigRemoteURL|ConfigRemoteURLFromKey|ConfigPlugin>} [options.extraConfigs] - (optional) and array of extra files to load
 * @param {Function} [fullyLoadedCallback] - (optional) called when the config is fully loaded
 */
function init(options, fullyLoadedCallback) {
  if (configInitCalledWithName) {
    logger.warn('Skipping initalization! boiler is already initialized with appName: ' + configInitCalledWithName)
    return boiler;
  };

  // append the value of process.env.PRYV_BOILER_POSTFIX if present
  if (process.env.PRYV_BOILER_POSTFIX) options.appName += process.env.PRYV_BOILER_POSTFIX;

  logging.setGlobalName(options.appName);
  configInitCalledWithName = options.appName;
  config.initSync({
    baseConfigDir: options.baseConfigDir,
    extras: options.extraConfigs
  }, logging);

  config.initASync().then((config) => {
    configIsInitalized = true;
    if (fullyLoadedCallback) fullyLoadedCallback(config);
  });

  logger = logging.getLogger('boiler')
  return boiler
}

async function getConfig() {
  if (! configInitCalledWithName) {
    throw(new Error('boiler must be initalized with init() before using getConfig()'));
  };
  while(! configIsInitalized) {
    await new Promise(r => setTimeout(r, 100)); // wait 100ms
  }
  return config;
}


module.exports = boiler;