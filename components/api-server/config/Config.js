/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const nconf = require('nconf');
const components = require('./components');

let config = null;

function getConfig(): Config {
  if (config == null) { // throw new Error('initialize the config before using it!');
    config = new Config();
  }
  return config;
}
module.exports = { getConfig };

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
    let configFile;
    if (store.get('config')) {
      configFile = store.get('config')
    } else if (store.get('NODE_ENV')) {
      configFile = 'config/' + store.get('NODE_ENV') + '.json';
    } else {
      configFile = 'config/development.json';
    }
    store.file({ file: configFile });
    loadComponents(store);
    this.store = store;
  }

  async init() {
    await loadAsyncComponents(this.store);
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
  Object.values(components).forEach(c => {
    if (c.load != null) c.load(store);
  });
  return store;
}

async function loadAsyncComponents(store: any): any {
  const comps = Object.values(components);
  for(let i=0; i<comps.length; i++) {
    if (comps[i].asyncLoad != null) await comps[i].asyncLoad(store);
  }
  return store;
}


