// @flow

const produceConvictInstance = require('./config');

import type { ConfigValue } from 'components/utils/src/config/value';
const { ExistingValue, MissingValue } = require('components/utils/src/config/value');

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
  config: Object;
  
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
      return new MissingValue(key); 
    }
    
    // assert: `config` contains a value for `key`
    const value = config.get(key);
    return new ExistingValue(key, value);
  }
  
  has(key: string): boolean {
    const config = this.config; 
    return config.has(key);
  }
    
  /** Configures convict (https://www.npmjs.com/package/convict) to read this  
   * application's configuration file. 
   */
  produceConfigInstance(): any {
    return produceConvictInstance(); 
  }
}

module.exports = Settings;
