// @flow

const { Extension, ExtensionLoader } = require('components/utils').extension;
const config = require('./config');

const { ExistingValue, MissingValue } = require('components/utils/src/config/value');

opaque type ConvictConfig = Object; 

import type { CustomAuthFunction } from 'components/model';
import type { ConfigValue } from 'components/utils/src/config/value';

const _ = require('lodash');
const request = require('superagent');

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
  static async load(configLocation: ?string): Promise<Settings> {
    config.printSchemaAndExitIfNeeded();

    const ourConfig = config.setup(configLocation);
    
    const settings = new Settings(ourConfig);
    await settings.loadRegisterInfo();
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

  async loadRegisterInfo() {
    const regUrlPath = this.get('services.register.url');
    if(!regUrlPath) {
      console.warn('Parameter "services.register.url" is undefined, set it in the configuration to allow core to provide service infos');
      return;
    }
    
    const regUrl = regUrlPath.value + '/service/infos';
    let res;
    try {
      res = await request.get(regUrl);
    } catch (error) {
      console.warn('Unable to retrieve service-infos from Register on URL:', regUrl, 'Error:', error);
      return;
    }

    this.setConvict(this.convict, 'serial', res.body.serial, regUrl);
    this.setConvict(this.convict, 'access', res.body.access, regUrl);
    this.setConvict(this.convict, 'api', res.body.api, regUrl);
    this.setConvict(this.convict, 'http.register.url', res.body.register, regUrl);
    this.setConvict(this.convict, 'http.static.url', res.body.home, regUrl);
    this.setConvict(this.convict, 'service.name', res.body.name, regUrl);
    this.setConvict(this.convict, 'service.support', res.body.support, regUrl);
    this.setConvict(this.convict, 'service.terms', res.body.terms, regUrl);
    this.setConvict(this.convict, 'eventTypes.sourceURL', res.body.eventTypes, regUrl);
  }

  setConvict(convict: any, memberName: string, value: Object, regUrl: string) {
    if(!value) {
      return;
    }
    convict.set(memberName, value);
  }
}
module.exports = Settings;
