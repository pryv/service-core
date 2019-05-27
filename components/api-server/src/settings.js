// @flow

const { Extension, ExtensionLoader } = require('components/utils').extension;
const config = require(__dirname + '/config');

const { ExistingValue, MissingValue } = require('components/utils/src/config/value');

opaque type ConvictConfig = Object; 

import type { CustomAuthFunction } from 'components/model';
import type { ConfigValue } from 'components/utils/src/config/value';

export interface ConfigAccess {
  get(key: string): ConfigValue;
  has(key: string): boolean;
  getCustomAuthFunction(): ?CustomAuthFunction;
}

export type { ConfigValue };

// Handles loading and access to project settings. 
//
class Settings implements ConfigAccess {
  convict: ConvictConfig; 
  customAuthStepFn: ?Extension; 
  
  // Loads the settings for production use. This means that we follow the order
  // defined in config.load. 
  // 
  // Additionally, you can pass `configLocation` which will override the env
  // and the command line arguments. 
  //
  static load(configLocation: ?string): Settings {
    config.printSchemaAndExitIfNeeded();

    const ourConfig = config.setup(configLocation);
    
    const settings = new Settings(ourConfig);
    
    settings.maybePrint(); 
     
    return settings; 
  }

  constructor(ourConfig: ConvictConfig) {
    this.convict = ourConfig;
    this.customAuthStepFn = this.loadCustomExtension(); 
  }
  
  maybePrint() {
    const shouldPrintConfig = this.get('printConfig').bool(); 
    
    if (shouldPrintConfig) {
      console.info('Configuration settings loaded', this.convict.get()); // eslint-disable-line no-console
    }
  }
  loadCustomExtension(): ?Extension {
    const defaultFolder = this.get('customExtensions.defaultFolder').str(); 
    const name = 'customAuthStepFn';
    const customAuthStepFnPath = this.get('customExtensions.customAuthStepFn');
    
    const loader = new ExtensionLoader(defaultFolder);

    if (! customAuthStepFnPath.blank())
      return loader.loadFrom(customAuthStepFnPath.str());
    
    // assert: no path was configured in configuration file, try loading from 
    // default location:
    return loader.load(name);
  }
  
  /** Returns the value for the configuration key `key`.  
   * 
   * Example: 
   * 
   *    settings.get('logs.console.active') //=> true
   *
   * @return {ExistingValue} Returns the configuration value that corresponds to 
   *    `key` given. 
   * @throws {Error} If the key you're trying to access doesn't exist in the 
   *    configuration. This is a hard error, since we have a schema that the 
   *    configuration file corresponds to. 
   * 
   */
  get(key: string): ConfigValue {
    const configuration = this.convict; 
    
    if (! configuration.has(key)) 
      return Settings.missingValue(key);
    
    // assert: `config` contains a value for `key`
    const value = configuration.get(key);
    return Settings.existingValue(key, value);
  }
  
  // Returns true if the given key exists in the configuration, false otherwise. 
  // 
  has(key: string): boolean {
    return this.convict.has(key) && this.convict.get(key) != null;
  }

  // Returns the custom auth function if one was configured. Otherwise returns
  // null. 
  // 
  getCustomAuthFunction(): ?CustomAuthFunction {
    if (this.customAuthStepFn == null) return null; 
    
    return this.customAuthStepFn.fn; 
  }
  
  static missingValue(key: string): ConfigValue {
    return new MissingValue(key);
  }
  static existingValue(key: string, value: mixed): ConfigValue {
    return new ExistingValue(key, value);
  }
}
module.exports = Settings;

