'use strict';
// @flow

const convict = require('convict');

/** 
 * Encapsulates values that are obtained from the configuration (file/...). 
 * This makes sure that all access to values from the configuration is type 
 * safe. 
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
   * Returns the configuration value as a number. 
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
  
  _typeError(typeName: string) {
    const name = this.name; 
    
    return new Error(`Configuration value type mismatch: ${name} should be of type ${typeName}, but isn't.`); 
  }
}

/** 
 * Handles loading and access to project settings. If you're looking for the 
 * configuration schema, please see {produceConfigInstance}. 
 * 
 * @see ConfigValue
 */
class Settings {
  config: Object; // TODO can we narrow this down?
  
  /** Constructs and loads settings from the file configured in 'config_file', 
   * which - by default - points to 'hfs-server.json' in the current directory. 
   */
  static load(): Settings {
    const settings = new Settings(); 
    const configFilePath = settings.get('config_file').str(); 
    
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
  }
  
  /** Loads configuration values from the file pointed to by `path`.
   */
  loadFromFile(path: string) {
    const config = this.config; 
    config.loadFile(path);
  }
  
  /** Returns the value for the configuration key `key`.  
   * 
   * Example: 
   * 
   *    settings.get('logs.console.active') //=> true
   *
   * @see ConfigValue
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
    const formats = {
      logLevel: [ 'debug', 'info', 'warn', 'error' ]
    };

    return convict({
      config_file: {
        doc: 'Path to the server configuration file.', 
        format: String, 
        default: 'hfs-server.json', 
        arg: 'config', 
      },
      logs: {
        console: {
          active: {
            doc: 'Should the server log to console?',
            format: Boolean,
            default: true
          },
          level: {
            doc: 'Log level for the console.',
            format: formats.logLevel,
            default: 'debug'
          },
          colorize: {
            doc: 'Should console output be colorized?',
            format: Boolean,
            default: true
          }
        },
        file: {
          active: {
            doc: 'Should the server log to a file?',
            format: Boolean,
            default: false
          },
          level: {
            doc: 'Log level for the log file.',
            format: formats.logLevel,
            default: 'error'
          },
          path: {
            doc: 'Where is the log file stored?', 
            format: String,
            default: 'server.log'
          },
          maxFileBytes: {
            format: 'nat',
            default: 4096
          },
          maxNbFiles: {
            format: 'nat',
            default: 20
          }
        },
        airbrake: {
          active: {
            doc: 'Should the server log to airbrake?',
            format: Boolean,
            default: false
          },
          key: {
            doc: 'Airbrake API key.',
            format: String,
            default: '',
          }
        }
      },
      http: {
        ip: {
          doc: 'IP address to bind the server to.', 
          format: String, 
          default: '127.0.0.1',
        }, 
        port: {
          doc: 'Port to bind to.', 
          format: 'nat', 
          default: 9000, 
        }
      }
    });
  }
}

module.exports = Settings;
