// @flow

const fs = require('fs');
const path = require('path');

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
    const hfsConfigPath = tryFind(basePath, [
      'conf/hfs/conf/hfs.json',
    ]);

    const coreConfigPath = tryFind(basePath, [
      'conf/core/conf/core.json',
    ]);


    return new Configuration(coreConfigPath, hfsConfigPath); 

    // -- Helpers: -------------------------------------------------------------

    function tryFind(base: string, candidates: Array<string>): ?string {
      for (const candidate of candidates) {
        const full = path.join(base, candidate);
        const stat = fs.statSync(full);

        if (stat.isFile()) return candidate;
      }

      return null; 
    }
  }

  _corePath: string;
  _hfsPath: string;

  constructor(corePath: string, hfsPath: string) {
    this._corePath = corePath;
    this._hfsPath = hfsPath;
  }

  coreConfigPath(): string { return this._corePath; }
  hfsConfigPath(): string { return this._hfsPath; }
}

module.exports = Configuration;