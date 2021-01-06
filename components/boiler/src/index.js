/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const gifnoc  = require('./gifnoc');
const gniggol = require('./gniggol');

const boiler = {
  getReggol: gniggol.getReggol, 
  gifnoc: gifnoc, 
  getGifnoc: getGifnoc,
  init: init
}

let logger;
let gifnocIsInitalized = false;
let gifnocInitCalledWithName = null;

/**
 * @typedef ConfigFile
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} file - the config file (.yaml)
 */

 /**
 * @typedef ConfigPlugin
 * @property {Object} plugin 
 * @property {Function} plugin.load - a function that takes the "nconf store" as argument and returns the "name" of the plugin
 */

/**
 * @typedef ConfigRemoteURL
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} [key] - (optional) key to load result of url. If null override 
 * @property {string} url - the url to the config definition 
 */
/**
 * @typedef ConfigRemoteURLFromKey
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} [key] - (optional) key to load result of url. If null override 
 * @property {string} urlFromKey - retrieve url from config matching this key
 */


/**
 * Init Boiler, should be called just once when starting an APP
 * @param {Object} options
 * @param {string} options.appName - the name of the Application used by Logger and debug
 * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs
 * @param {Array<ConfigFile|ConfigPlugin>} [options.extraSync] - (optional) and array of extra files to load
 * @param {Array<ConfigRemoteURL|ConfigRemoteURLFromKey|ConfigPlugin>} [options.extraAsync] - (optional) and array of extra files to load
 * @param {Function} [fullyLoadedCallback] - (optional) called when the config is fully loaded
 */
function init(options, fullyLoadedCallback) {
  if (gifnocInitCalledWithName) {
    logger.warn('Skipping initalization! boiler is already initialized with appName: ' + gifnocInitCalledWithName)
    return gifnoc;
  };

  gniggol.setGlobalName(options.appName);
  gifnocInitCalledWithName = options.appName;
  gifnoc.initSync({
    baseConfigDir: options.baseConfigDir,
    extraSync: options.extraSync
  }, gniggol);

  gifnoc.initASync({
    extraAsync: options.extraAsync,
  }).then((config) => {
    gifnocIsInitalized = true;
    if (fullyLoadedCallback) fullyLoadedCallback(config);
  });

  logger = gniggol.getReggol('boiler')
  return boiler
}

async function getGifnoc() {
  while(! gifnocIsInitalized) {
    await new Promise(r => setTimeout(r, 100)); // wait 100ms
  }
  return gifnoc;
}


module.exports = boiler;