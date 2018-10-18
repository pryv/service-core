// @flow

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
    basePath;
    return new Configuration(); 
  }

  constructor() {
  }
}

module.exports = Configuration;