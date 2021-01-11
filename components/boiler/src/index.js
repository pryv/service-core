/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const Gifnoc  = require('./gifnoc');
const gniggol = require('./gniggol');

const gifnoc = new Gifnoc();

const boiler = {
  getReggol: gniggol.getReggol, 
  getGifnoc: getGifnoc,
  init: init,
  gifnoc: gifnoc 
}

let logger;
let gifnocIsInitalized = false;
let gifnocInitCalledWithName = null;


/**
 * Init Boiler, should be called just once when starting an APP
 * @param {Object} options
 * @param {string} options.appName - the name of the Application used by Logger and debug
 * @param {string} [options.baseConfigDir] - (optional) directory to use to look for configs
 * @param {Array<ConfigFile|ConfigRemoteURL|ConfigRemoteURLFromKey|ConfigPlugin>} [options.extraConfigs] - (optional) and array of extra files to load
 * @param {Function} [fullyLoadedCallback] - (optional) called when the config is fully loaded
 */
function init(options, fullyLoadedCallback) {
  if (gifnocInitCalledWithName) {
    logger.warn('Skipping initalization! boiler is already initialized with appName: ' + gifnocInitCalledWithName)
    return gifnoc;
  };

  // append the value of process.env.PRYV_BOILER_POSTFIX if present
  if (process.env.PRYV_BOILER_POSTFIX) options.appName += process.env.PRYV_BOILER_POSTFIX;

  gniggol.setGlobalName(options.appName);
  gifnocInitCalledWithName = options.appName;
  gifnoc.initSync({
    baseConfigDir: options.baseConfigDir,
    extras: options.extraConfigs
  }, gniggol);

  gifnoc.initASync().then((config) => {
    gifnocIsInitalized = true;
    if (fullyLoadedCallback) fullyLoadedCallback(config);
  });

  logger = gniggol.getReggol('boiler')
  return boiler
}

async function getGifnoc() {
  if (! gifnocInitCalledWithName) {
    throw(new Error('boiler must be initalized with init() before using getGifnoc()'));
  };
  while(! gifnocIsInitalized) {
    await new Promise(r => setTimeout(r, 100)); // wait 100ms
  }
  return gifnoc;
}


module.exports = boiler;