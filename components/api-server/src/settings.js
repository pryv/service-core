// @flow

const { Extension, ExtensionLoader } = require('components/utils').extension;
const config = require('./config');

opaque type ConvictConfig = Object; // TODO can we narrow this down?

import type { CustomAuthFunction } from 'components/model';

// Handles loading and access to project settings. 
//
class Settings {
  convict: ConvictConfig; 
  customAuthStepFn: ?Extension; 
  
  // Loads the settings for production use. This means that we follow the order
  // defined in config.load.
  //
  static load(): Settings {
    config.printSchemaAndExitIfNeeded();

    const ourConfig = config.setup();
    
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
   * @return {ConfigValue} Returns the configuration value that corresponds to 
   *    `key` given. 
   * @throws {Error} If the key you're trying to access doesn't exist in the 
   *    configuration. This is a hard error, since we have a schema that the 
   *    configuration file corresponds to. 
   * 
   */
  get(key: string): ConfigValue {
    const configuration = this.convict; 
    
    if (! configuration.has(key)) 
      return new MissingValue(key);
    
    // assert: `config` contains a value for `key`
    const value = configuration.get(key);
    return new ConfigValue(key, value);
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
}
module.exports = Settings;

/** Encapsulates values that are obtained from the configuration (file/...) using
 * a convict configuration for this project. 
 *
 * Example: 
 * 
 *    var settings = Settings.load(); 
 *    var value = settings.get('logs.console.active');
 *    value.bool() //=> true (or a type error)
 */
class ConfigValue {
  name: string; 
  value: mixed; 
  
  constructor(name: string, value: mixed) {
    this.name = name; 
    this.value = value; 
  }
  
  // REturns the configuration value as a boolean. 
  // 
  bool(): boolean {
    const value = this.value; 
    if (typeof value === 'boolean') {
      return value; 
    }
    
    throw this._typeError('boolean');
  }
  
  /** 
   * Returns the configuration value as a string. 
   */
  str(): string {
    const value = this.value; 
    if (typeof value === 'string') {
      return value; 
    }
    
    throw this._typeError('string');
  }
  
  /** 
   * Returns the configuration value as a number. 
   */
  num(): number {
    const value = this.value; 
    if (typeof value === 'number') {
      return value; 
    }
    
    throw this._typeError('number');
  }
  
  /** 
   * Returns the configuration value as an unspecified object. 
   */
  obj(): {} {
    const value = this.value; 
    
    // NOTE Flow doesn't want values to be null, that's why the second check is
    // also needed. (typeof null === 'object'...)
    if (typeof value === 'object' && value != null) {
      return value; 
    }
    
    throw this._typeError('object');
  }

  /** 
   * Returns the configuration value as an unspecified object. 
   */
  fun(): (...a: Array<mixed>) => void {
    const value = this.value;  
    
    if (typeof value === 'function') {
      return value; 
    }
    
    throw this._typeError('function');
  }
  
  // Returns true if the value exists, meaning that it is not null or undefined.
  // 
  exists(): boolean {
    const value = this.value;  

    return value != null; 
  }
  
  // Returns true if the value is either null, undefined or the empty string. 
  // 
  blank(): boolean {
    const value = this.value;  

    return !this.exists() || value === ''; 
  }
  
  _typeError(typeName: string) {
    const name = this.name; 
        
    return new Error(
      `Configuration value type mismatch: ${name} should be of type ${typeName}, but isn't. `+
      `(typeof returns '${typeof this.value}')`); 
  }
}

class MissingValue extends ConfigValue {
  // NOTE maybe we should define a common interface rather than inheriting 
  //   in this way. Oh well.
  
  message: string; 
  
  constructor(key: string) {
    super(key, null);
    
    this.message = `Configuration for '${key}' missing.`;
  }
  
  exists(): false {
    return false; 
  }
}
