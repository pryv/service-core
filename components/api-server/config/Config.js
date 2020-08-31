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
  if (config == null) {
    config = new Config();
  }
  return config;
}
module.exports = { getConfig };

export type { Config };

class Config {

  store: {};

  isInitialized: boolean = false;
  isInitializing: boolean = false;

  logger: {};
  notifier: {};

  constructor() {
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
    this.store = store;
    loadComponents(this.store);
  }

  async init() {
    if (this.isInitializing) {console.log('KABOOM'); return new Error('config.init() called twice.')};
    this.isInitializing = true;
    await loadAsyncComponents(this.store);
    this.isInitialized = true;
    this.isInitializing = false;
  }

  get(key: string): any {
    if (! this.isInitialized && ! isTest()) return new Error('calling config.get() before it is initialized.');
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    if (! this.isInitialized && ! isTest()) return new Error('calling config.set() before it is initialized.');
    this.store.set(key, value);
  }

  getLogger(prefix: string): any {
    return this.logger;
  }
}

function isTest(): boolean {
  return process.env.NODE_ENV === 'test'
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
