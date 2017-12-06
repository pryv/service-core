// @flow

const path = require('path');
const fs = require('fs');

const config = require('./config');

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
  obj(): mixed {
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
  
  _typeError(typeName: string) {
    const name = this.name; 
    
    return new Error(`Configuration value type mismatch: ${name} should be of type ${typeName}, but isn't.`); 
  }
}

opaque type ConvictConfig = Object; 

// Handles loading and access to project settings. 
//
class Settings {
  convict: ConvictConfig; // TODO can we narrow this down?
  
  // Loads the settings for production use. This means that we follow the order
  // defined in config.load.
  //
  static load(): Settings {
    config.printSchemaAndExitIfNeeded();

    const ourConfig = config.setup();
    
    const settings = new Settings(ourConfig);
    
    settings.maybePrint(); 
    settings.loadCustomExtensions(); 
     
    return settings; 
  }

  constructor(ourConfig: ConvictConfig) {
    this.convict = ourConfig;
  }
  
  maybePrint() {
    const shouldPrintConfig = this.get('printConfig').bool(); 
    
    if (shouldPrintConfig) {
      console.info('Configuration settings loaded', this.convict.get()); // eslint-disable-line no-console
    }
  }
  loadCustomExtensions() {
    // NOTE Yes, this is a duplicate of config.loadCustomExtensions. If we want
    //    to make settings type safe, we cannot just keep them as a big js Object. 
    
    const configuration = this.convict; 
    const extSettings = this.get('customExtensions').obj(); 
    const defaultFolder = this.get('customExtensions.defaultFolder').str(); 
    const format = config.customFormats['function-module'];
    
    if (extSettings == null) return; 
    
    for (const key of Object.keys(extSettings)) {
      // Skip the only key that doesn't point to a file
      if (key === 'defaultFolder') continue; 
      
      // Skip values that have been set (and thus: loaded)
      const value = extSettings[key];
      if (value != null) continue; 
      
      // assert: value == null, no explicit file path was set.
      
      // Load from default folder anyway.
      const defaultModulePath = path.join(defaultFolder, `${key}.js`);
      
      // Does the file exist? 
      if (! fs.existsSync(defaultModulePath)) continue;
      
      // assert: file exists @ defaultModulePath
      format.validate(defaultModulePath);
      
      // Store the loaded value back into the public configuration.
      configuration.set(`customExtensions.${key}`, 
        format.coerce(defaultModulePath));
    }
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
    
    if (! configuration.has(key)) {
      throw new Error(`Configuration for '${key}' missing.`);
    }
    
    // assert: `config` contains a value for `key`
    const value = configuration.get(key);
    return new ConfigValue(key, value);
  }
  
  // Returns true if the given key exists in the configuration, false otherwise. 
  // 
  has(key: string): boolean {
    return this.convict.has(key) && this.convict.get(key) != null;
  }
}

module.exports = Settings;
