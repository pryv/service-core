/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const nconf = require('nconf');
const components = require('./components');
const defaultConfig = require('./defaultConfig').defaultConfig;

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

  configFile: string;

  constructor() {
    this.initializeConfig();
  }

  initializeConfig () {
    // TODO set logger

    const store = new nconf.Provider();

    // get config from arguments and env variables
    // memory must come first for config.set() to work without loading config files
    // 1. `process.env`
    // 2. `process.argv`
    store.use('memory').argv().env();

    // 3. Values in `config.json`
    if (store.get('config')) {
      this.configFile = store.get('config')
    } else if (store.get('NODE_ENV')) {
      this.configFile = 'config/' + store.get('NODE_ENV') + '.json';
    } else {
      this.configFile = 'config/development.json';
    }
    store.file({ file: this.configFile});

    /**
     * This can be removed once "singleNode" has been removed of all configs
     * This is a duplicate of /components/utils/src/config.js duplicate code 
     * They should be updated simulatenously
     */
    if (store.get('singleNode')) {
        console.log("Warning (Config) [singleNode] config parameter has been depracted and replaced by [dnsLess]");
        store.set('dnsLess', store.get('singleNode'));
        store.set('singleNode', null);
    }

    // remove this when config is loaded in all tests before other components that use it. See commits:
    // - f7cc95f70aae87ebb0776f94256c14eeec54baa3
    // - a0e31f8f8dd4b9756635d80923143e256ccd0077
    components.systemStreams.load(store);

    this.store = store;
    this.setDefaults();
  }

  async init () {
    if (this.isInitializing && ! isTest()) return new Error('config.init() called twice.');
    this.isInitializing = true;
    await loadComponents(this.store);
    this.isInitialized = true;
    this.isInitializing = false;
  }

  /**
   * For tests it is usuaful to reset initial config after the 
   * test was finished
   */
  async resetConfig () {
    if (isTest()){
      this.initializeConfig();
    } else {
      console.log('To reset the config is only allowed in tests');
    }
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
  
  setDefaults (): void {
    this.store.defaults(defaultConfig);
  }
}

function isTest(): boolean {
  return process.env.NODE_ENV === 'test'
}

async function loadComponents (store: any): any {
  const comps = Object.values(components);
  for(let i=0; i < comps.length; i++) {
    await comps[i].load(store);
  }
  return store;
}
