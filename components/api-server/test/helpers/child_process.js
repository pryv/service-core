// @flow

const debug = require('debug')('test-child');
const msgpack = require('msgpack5')();

const Server = require('../../src/server');
const Settings = require('../../src/settings');

import type { CustomAuthFunction } from 'components/model';
import type { ConfigAccess, ConfigValue } from '../../src/settings';

// Masks the config with values from `mask`. 
class ConfigMask implements ConfigAccess {
  mask: Object; 
  settings: Settings;
  
  constructor(mask: Object, settings: Settings) {
    this.mask = mask; 
    this.settings = settings;
  }
  
  get(key: string): ConfigValue {
    const value = this.getMask(key);
    if (value != null) return value; 
    
    return this.settings.get(key);
  }
  has(key: string): boolean {
    const value = this.getMask(key);
    if (value != null) return true; 
    
    return this.settings.has(key);
  }
  getCustomAuthFunction(): ?CustomAuthFunction {
    return this.settings.getCustomAuthFunction();
  }
  
  // Returns null if the mask doesn't contain a value for key, otherwise
  // returns the proper ConfigValue for the key. 
  //
  getMask(key: string): ?ConfigValue {
    let current = this.mask; 
    let lastPart = null; 
    const parts = key.split('.');
    
    while (current != null && parts.length > 0) {
      const part = parts.shift(); 
      lastPart = part; 
      
      current = current[part];
    }
    
    if (current != null)
      return Settings.existingValue(lastPart || 'n/a', current);
      
    return null; 
  }
}

// This bit is useful to trace down promise rejections that aren't caught. 
process.on('unhandledRejection', (reason, promise) => {
  console.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 
    'reason:', reason.stack || reason); 
});

process.on('message', (wireMessage) => {
  const message = msgpack.decode(wireMessage);
  debug('received ', message);
  
  const [cmd, ...args] = message; 
  switch(cmd) {
    case 'int_startServer': 
      intStartServer(args[0]); 
      break; 
  }
});

async function intStartServer(injectSettings: {}) {
  const settings = Settings.load(); 
  const masked = new ConfigMask(injectSettings, settings);
  
  const server = new Server(masked); 
  await server.start(); 
  
  sendToParent('int_started');
}

function sendToParent(cmd, ...args) {
  // FLOW Somehow flow-type doesn't know about process here. 
  process.send(
    msgpack.encode([cmd, ...args]));
}

function work() {
  setTimeout(work, 1000);
}

work(); 
