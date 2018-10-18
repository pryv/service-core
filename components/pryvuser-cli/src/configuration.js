// @flow

const fs = require('fs');
const path = require('path');

export interface ConfigurationLoader {
  load: (basePath: string) => Promise<Configuration>,
}

type ConfigKinds = 'core' | 'hfs';
type PathCandidates = {[kind: ConfigKinds]: Array<string>};
type FoundPaths = { [kind: ConfigKinds]: ?string };

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
    const candidates: PathCandidates = {
      core: [
        'conf/core/conf/core.json',
      ], 
      hfs: [
        'conf/hfs/conf/hfs.json',
      ],
    };

    const foundPaths: FoundPaths = {
      core: null, 
      hfs: null, 
    };
    for (const configKind of Object.keys(candidates)) {
      const pathCandidates = candidates[configKind];
      const found = tryFind(basePath, pathCandidates);

      if (found == null)
        throw new Error(
          `Could not find ${configKind} configuration after looking in all candidate locations.`);

      foundPaths[configKind] = found;
    }

    if (foundPaths.core == null || foundPaths.hfs == null)
      throw new Error('AF: All paths have been found here.');

    return new Configuration(foundPaths.core, foundPaths.hfs); 

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