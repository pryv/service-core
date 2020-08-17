/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const nconf = require('nconf');
const yaml = require('js-yaml');
const fs = require('fs');
const components = require('./components');

let config = null;
async function initConfig(): Promise<Config> {
  if (config == null) {
    config = new Config();
  }
  if (! config.isReady) {
    await config.init();
  }
  return config;
}

function getConfig(): Config {
  if (config == null) { // throw new Error('initialize the config before using it!');
    config = new Config();
  }
  return config;
}
module.exports = { initConfig, getConfig };

export type { Config };

class Config {

  store;
  logger;
  isReady: boolean;
  notifier;

  constructor() {
    this.isReady = false;
    // TODO set logger

    const store = new nconf.Provider();

    // get config from arguments and env variables
    // memory must come first for config.set() to work without loading config files
    // 1. `process.env`
    // 2. `process.argv`
    store.use('memory').argv().env();

    // 3. Values in `config.json`
    const configFile = store.get('config') || 'development.json';
    store.file({ file: configFile });

    loadComponents(store);
    this.store = store;
  }

  async init() {
    
    this.isReady = true;
  }

  get(key: string): any {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  getLogger(prefix: string): any {
    return this.logger;
  }
}

function loadComponents(store: any): any {
  Object.keys(components).forEach(c => {
    components[c].load(store);
  });
  return store;
}
