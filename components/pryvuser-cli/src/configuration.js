// @flow

const fs = require('fs');
const path = require('path');
const CoreSettings = require('components/api-server/src/settings');
const HfsSettings = require('components/hfs-server/src/Settings');

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
      'hfs/conf/hfs.json',
    ]);

    const coreConfigPath = tryFind('core', basePath, [
      'core/conf/core.json',
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

  _hfsConfig: ?HfsSettings;

  constructor(corePath: string, hfsPath: string) {
    this._corePath = corePath;
    this._hfsPath = hfsPath;
  }

  coreConfigPath(): string { return this._corePath; }

  hfsConfigPath(): string { return this._hfsPath; }

  async registrySettings(): Promise<RegistrySettings> {
    const coreConfig = await this.coreConfig();

    return {
      url: coreConfig.get('services.register.url').str(),
      key: coreConfig.get('services.register.key').str(),
    };
  }

  async mongoDbSettings(): Promise<MongoDbSettings> {
    const coreConfig = await this.coreConfig();

    return {
      host: coreConfig.get('database.host').str(),
      port: coreConfig.get('database.port').num(),
      dbname: coreConfig.get('database.name').str(),

      fileStore: await this.fileStoreSettings(),
    };
  }

  influxDbSettings(): InfluxDbSettings {
    const hfsConfig = this.hfsConfig();

    return {
      host: hfsConfig.get('influxdb.host').str(),
      port: hfsConfig.get('influxdb.port').num(),
    };
  }

  async fileStoreSettings(): Promise<FileStoreSettings> {
    const coreConfig = await this.coreConfig();

    return {
      attachmentsPath: coreConfig.get('eventFiles.attachmentsDirPath').str(),
      previewsPath: coreConfig.get('eventFiles.previewsDirPath').str(),
    };
  }

  /// Loads and memoises core configuration.
  ///
  async coreConfig(): Promise<CoreSettings> {
    const coreConfig = this._coreConfig;
    if (coreConfig != null) return coreConfig;

    const newConfig = await CoreSettings.load(this.coreConfigPath());
    this._coreConfig = newConfig;

    return newConfig;
  }

  hfsConfig(): HfsSettings {
    if (this._hfsConfig != null) return this._hfsConfig;

    const config = HfsSettings.loadFromFile(this.hfsConfigPath());
    this._hfsConfig = config;

    return config;
  }
}

export type RegistrySettings = {
  url: string,
  key: string,
};

export type MongoDbSettings = {
  host: string,
  port: number,
  dbname: string,

  fileStore: FileStoreSettings,
};

export type InfluxDbSettings = {
  host: string,
  port: number,
};

export type FileStoreSettings = {
  attachmentsPath: string,
  previewsPath: string,
}

module.exports = Configuration;
