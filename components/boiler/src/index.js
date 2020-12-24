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
 * @property {string} file - the config file 
 */

/**
 * @typedef ConfigRemote
 * @property {string} scope - scope for nconf hierachical load
 * @property {string} [key] - (optional) key to load result of url. If null override 
 * @property {string} url - the url to the config definition 
 * @property {string} fromKey - retroive url from config matching this key
 */


/**
 * Init Boiler, should be called just once when starting an APP
 * @param {Object} options
 * @param {string} options.appName - the name of the Application used by Logger and debug
 * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs
 * @param {Array<ConfigFile>} [options.extraConfigFiles] - (optional) and array of extra files to load
 * @param {Array<ConfigRemote>} [options.extraConfigRemotes] - (optional) and array of extra files to load
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
    extraConfigFiles: options.extraConfigFiles
  }, gniggol);

  gifnoc.initASync({
    extraConfigRemotes: options.extraConfigRemotes,
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