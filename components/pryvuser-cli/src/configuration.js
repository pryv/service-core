// @flow

const fs = require('fs');
const path = require('path');
const CoreSettings = require('components/api-server/src/settings');

export interface ConfigurationLoader {
  load: (basePath: string) => Promise<Configuration>,
}

/// Loads and manages configuration files from all components that we access 
/// from the command line. Typical usage would look like this: 
/// 
///   const config = Configuration.load(basePath);
///   config.getMongoDBConnSettings(); 
/// 
class Configuration {

  /// Loads the configuration by looking for various files below `basePath`. 
  /// Implements the `ConfigurationLoader` interface. 
  /// 
  static async load(basePath: string): Promise<Configuration> {
    const hfsConfigPath = tryFind('hfs', basePath, [
      'conf/hfs/conf/hfs.json',
    ]);

    const coreConfigPath = tryFind('core', basePath, [
      'conf/core/conf/core.json',
    ]);


    return new Configuration(coreConfigPath, hfsConfigPath); 

    // -- Helpers: -------------------------------------------------------------

    function tryFind(topic: string, base: string, candidates: Array<string>): string {
      for (const candidate of candidates) {
        const full = path.join(base, candidate);
        const stat = fs.statSync(full);

        if (stat.isFile()) return full;
      }

      throw new Error(`Could not locate ${topic} configuration file.`);
    }
  }

  _corePath: string;
  _hfsPath: string;
  _coreConfig: ?CoreSettings; 

  constructor(corePath: string, hfsPath: string) {
    this._corePath = corePath;
    this._hfsPath = hfsPath;
  }

  coreConfigPath(): string { return this._corePath; }
  hfsConfigPath(): string { return this._hfsPath; }

  registerSettings(): RegisterSettings {
    const coreConfig = this.coreConfig(); 

    return {
      url: coreConfig.get('services.register.url').str(), 
      key: coreConfig.get('services.register.key').str(), 
    };
  }

  mongoDbSettings(): MongoDbSettings {
    const coreConfig = this.coreConfig();

    return {
      host: coreConfig.get('database.host').str(), 
      port: coreConfig.get('database.port').num(),
      dbname: coreConfig.get('database.name').str(),  
    };
  }

  /// Loads and memoises core configuration. 
  /// 
  coreConfig(): CoreSettings {
    const coreConfig = this._coreConfig; 
    if (coreConfig != null) return coreConfig;

    const newConfig = CoreSettings.load(this.coreConfigPath());
    this._coreConfig = newConfig;

    return newConfig;
  }
}

type RegisterSettings = {
  url: string, 
  key: string, 
};

type MongoDbSettings = {
  host: string, 
  port: number, 
  dbname: string, 
};

module.exports = Configuration;