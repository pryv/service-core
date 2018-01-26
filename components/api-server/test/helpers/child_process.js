// @flow

const debug = require('debug')('test-child');
const msgpack = require('msgpack5')();

const Server = require('../../src/server');
const Settings = require('../../src/settings');
const Application = require('../../src/application');

import type { CustomAuthFunction } from 'components/model';
import type { ConfigAccess, ConfigValue } from '../../src/settings';

// Decorator for the Settings class that api-server uses. Accepts an object as 
// a mask; values from that object will overlay those from the actual loaded
// configuration.
//
// Example: 
// 
//    const overlay = { foo: 'bar' };
//    const mask = new ConfigMask(overlay, settings);
//  
//    mask.get('foo').str() // => 'bar'
//
class ConfigMask implements ConfigAccess {
  mask: Object; 
  settings: Settings;
  
  constructor(mask: Object, settings: Settings) {
    this.mask = mask; 
    this.settings = settings;
  }
  
  get(key: string): ConfigValue {
    // Overlaid?
    const value = this.getMask(key);
    if (value != null) return value; 
    
    // No.
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
    const parts = key.split('.');
    
    // Walk the parts array, updating current as we go. Each part is used to 
    // access the subobject stored below it. 
    while (current != null && parts.length > 0) {
      const part = parts.shift(); 
      
      current = current[part];
    }

    // No overlay found, stop here. 
    if (current == null) return null; 
    
    // If we haven't gone off the tracks, this is the overlay value we're
    // looking for. 
    return Settings.existingValue(key, current);
  }
}

// This bit is useful to trace down promise rejections that aren't caught. 
//
process.on('unhandledRejection', unhandledRejection);

// Receives messages from the parent (spawner.js) and dispatches them to the 
// handler functions below. 
//
process.on('message', dispatchParentMessage);

async function intStartServer(injectSettings: {}) {
  const settings = Settings.load(); 
  const masked = new ConfigMask(injectSettings, settings);
  const app = new Application(masked);
  
  const server = new Server(app); 
  await server.start(); 
  
  sendToParent('int_started');
}

function dispatchParentMessage(wireMessage: Buffer) {
  const message = msgpack.decode(wireMessage);
  
  const [cmd, ...args] = message; 
  debug('received ', cmd, args);
  
  switch(cmd) {
    case 'int_startServer': 
      intStartServer(args[0]); 
      break; 
    default: 
      throw new Error(
        `Child has received unknown message, ignoring... (${cmd})`);
  }
  
  debug('done', cmd);
}

// Helper function to answer something to the parent. This is the counterpart
// to 'dispatchParentMessage' above. 
function sendToParent(cmd, ...args) {
  // FLOW Somehow flow-type doesn't know about process here. 
  process.send(
    msgpack.encode([cmd, ...args]));
}

// Handles promise rejections that aren't caught somewhere. This is very useful
// for debugging. 
function unhandledRejection(reason, promise) {
  console.warn(                                // eslint-disable-line no-console
    'Unhandled promise rejection:', promise, 
    'reason:', reason.stack || reason); 
}

// Keeps the event loop busy. This is what the child does as long as it is not 
// serving requests. 
//
function work() {
  setTimeout(work, 10000);
}
work(); 
