// @flow

const produceConvictInstance = require('./config');

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
  obj(): Object {
    const value = this.value; 
    
    // NOTE Flow doesn't want values to be null, that's why the second check is
    // also needed. (typeof null === 'object'...)
    if (typeof value === 'object' && value != null) {
      return value; 
    }
    
    throw this._typeError('object');
  }
  
  // Returns the configuration value as a boolean. 
  // 
  bool(): boolean {
    const value = this.value; 
    if (typeof value === 'boolean') {
      return value; 
    }
    
    switch (value) {
      case 'true':
      case 'yes':
      case 'on':
        return true; 
      
      case 'false':
      case 'no': 
      case 'off': 
        return false; 
      
      default: 
        // FALLTHROUGH
    }
    
    
    throw this._typeError('boolean');
  }
  
  
  _typeError(typeName: string) {
    const name = this.name; 
    
    return new Error(`Configuration value type mismatch: ${name} should be of type ${typeName}, but isn't.`); 
  }
}

/** 
 * Handles loading and access to project settings. If you're looking for the 
 * configuration schema, please see {produceConfigInstance}. 
 * 
 * Uses convict internally to verify the configuration file and to handle 
 * command line arguments. Once loaded, the main method you will use is 
 * `#get(key)` which will return a {ConfigValue} to use in your code. 
 *
 * You should use either one of the static constructors: `.load()` for actual
 * server instances and `.loadFromFile(path)` for loading a test configuration. 
 */
class Settings {
  config: Object; // TODO can we narrow this down?
  
  /** Constructs and loads settings from the file configured in 'config_file', 
   * which - by default - points to 'hfs-server.json' in the current directory. 
   */
  static load(): Settings {
    const settings = new Settings(); 
    const configFilePath = settings.get('config').str(); 
    
    settings.loadFromFile(configFilePath);
    
    return settings; 
  }

  /** Constructs and loads settings from the file indicated in `path`.
   */
  static loadFromFile(path: string): Settings {
    const settings = new Settings(); 

    settings.loadFromFile(path);
    
    return settings; 
  }
  
  /** Class constructor. */
  constructor() {
    this.config = this.produceConfigInstance(); 
    this.config.validate(); 
  }
  
  // Loads configuration values from the file pointed to by `path`.
  //  
  // @throws {Error} `.code === ENOENT` if the configuration file doesn't exist. 
  // 
  loadFromFile(path: string) {
    const config = this.config; 
    config.loadFile(path);
  }
  
  // Merges a javascript configuration object into the settings. 
  //
  loadFromObject(obj: Object) {
    const config = this.config; 
    config.load(obj);
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
    const config = this.config; 
    
    if (! config.has(key)) {
      throw new Error(`Configuration for '${key}' missing.`);
    }
    
    // assert: `config` contains a value for `key`
    const value = config.get(key);
    return new ConfigValue(key, value);
  }
    
  /** Configures convict (https://www.npmjs.com/package/convict) to read this  
   * application's configuration file. 
   */
  produceConfigInstance(): any {
    return produceConvictInstance(); 
  }
}

module.exports = Settings;
