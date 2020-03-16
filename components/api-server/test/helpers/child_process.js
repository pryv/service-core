// @flow

const debug = require('debug')('api-server.child_process');

const Server = require('../../src/server');
const Settings = require('../../src/settings');
const Application = require('../../src/application');
const ChildProcess = require('components/test-helpers').child_process;

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

class ApplicationLauncher {
  app: ?Application; 
  
  constructor() {
    this.app = null; 
  }
  
  async launch(injectSettings: Object) {
    try {
      debug('launch', injectSettings);
      const settings = await Settings.load(); 
    
      const masked = new ConfigMask(injectSettings, settings);
      const app = this.app = new Application(masked);
    
      const server = new Server(app); 
      return server.start(); 

    } catch (e) { // this is necessary for debug process as Error is not forwarded correctly
      console.error('Error during child_process.launch()', e);
      throw e; // foward error
    }
  }
}

const appLauncher = new ApplicationLauncher();
const clientProcess = new ChildProcess(appLauncher); 
clientProcess.run(); 
