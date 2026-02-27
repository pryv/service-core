/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const VALID_ENGINES = ['mongodb', 'sqlite', 'postgresql'];

/**
 * Resolve the effective storage engine from configuration.
 *
 * Priority:
 *   1. `STORAGE_ENGINE` environment variable (for testing)
 *   2. `storageEngine` (unified key) when explicitly set
 *   3. Per-component key (`<componentKey>:engine`) for backward compatibility
 *   4. Default: 'mongodb' for 'database' component, 'sqlite' for others
 *
 * @param {Object} config - boiler config instance
 * @param {'database'|'storageUserAccount'|'storageUserIndex'|'storagePlatform'} [componentKey]
 * @returns {'mongodb'|'sqlite'|'postgresql'}
 */
function getStorageEngine (config, componentKey) {
  // Environment variable override (for testing)
  if (process.env.STORAGE_ENGINE) {
    const envEngine = process.env.STORAGE_ENGINE;
    if (!VALID_ENGINES.includes(envEngine)) {
      throw new Error(`Invalid STORAGE_ENGINE env: "${envEngine}". Must be one of: ${VALID_ENGINES.join(', ')}`);
    }
    return envEngine;
  }

  if (config.has('storageEngine')) {
    const engine = config.get('storageEngine');
    if (engine) {
      if (!VALID_ENGINES.includes(engine)) {
        throw new Error(`Invalid storageEngine value: "${engine}". Must be one of: ${VALID_ENGINES.join(', ')}`);
      }
      return engine;
    }
  }

  // Fall back to per-component key
  if (componentKey) {
    const key = componentKey + ':engine';
    if (config.has(key)) {
      const componentEngine = config.get(key);
      if (componentEngine) return componentEngine;
    }
  }

  // Defaults
  if (componentKey === 'database') return 'mongodb';
  return 'sqlite';
}

module.exports = getStorageEngine;
