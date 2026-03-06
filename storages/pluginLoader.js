/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Storage plugin loader.
 *
 * Discovers and loads storage engine plugins from storages/engines/.
 * Each engine has a manifest.json declaring supported storageTypes and a
 * JS entrypoint exporting factory functions (createBaseStorage, createDataStore, etc.).
 *
 * Usage:
 *   const pluginLoader = require('storages/pluginLoader');
 *   await pluginLoader.init(config);
 *   const engine = pluginLoader.getEngineModule(pluginLoader.getEngineFor('platformStorage'));
 *   const platformDB = engine.createPlatformDB();
 */

const path = require('path');
const fs = require('fs');
const { validateManifest, VALID_STORAGE_TYPES } = require('./manifest-schema');

const ENGINES_DIR = path.join(__dirname, 'engines');

// storageType → required exported methods
const REQUIRED_EXPORTS = {
  baseStorage: ['initStorageLayer', 'getUserAccountStorage', 'getUsersLocalIndex'],
  platformStorage: ['createPlatformDB'],
  dataStore: ['getDataStoreModule'],
  seriesStorage: ['createSeriesConnection'],
  fileStorage: ['createFileStorage'],
  auditStorage: ['createAuditStorage']
};

/**
 * Engine registry: engineName → { manifest, module, dir }
 */
const engines = {};

/**
 * Resolved config: storageType → { engine: string, config: object }
 */
let resolvedConfig = null;

let initialized = false;

/**
 * Discover and register all engine plugins from the engines/ directory.
 * Does NOT instantiate anything — just loads manifests and entrypoints.
 */
function discover () {
  if (!fs.existsSync(ENGINES_DIR)) return;

  const entries = fs.readdirSync(ENGINES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const engineDir = path.join(ENGINES_DIR, entry.name);
    const manifestPath = path.join(engineDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) continue;

    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const manifest = validateManifest(rawManifest, engineDir);

    // Engine name is the folder name (package metadata belongs in package.json)
    const engineName = entry.name;

    const entrypointPath = path.join(engineDir, manifest.entrypoint);
    if (!fs.existsSync(entrypointPath)) {
      throw new Error(`Engine "${engineName}": entrypoint not found at ${entrypointPath}`);
    }

    engines[engineName] = {
      manifest,
      dir: engineDir,
      module: null // lazy-loaded on first getEngineModule()
    };
  }
}

/**
 * Validate that all discovered engines export the required methods
 * for their declared storageTypes. Called after discover().
 */
function validateEngineExports () {
  for (const [engineName, engine] of Object.entries(engines)) {
    const mod = getEngineModule(engineName);
    for (const storageType of engine.manifest.storageTypes) {
      const required = REQUIRED_EXPORTS[storageType];
      if (!required) continue;
      for (const method of required) {
        if (typeof mod[method] !== 'function') {
          throw new Error(
            `Engine "${engineName}" declares storageType "${storageType}" ` +
            `but does not export required method "${method}"`
          );
        }
      }
    }
  }
}

/**
 * Get the module for an engine, loading it if needed.
 * @param {string} engineName
 * @returns {Object} The engine's exports
 */
function getEngineModule (engineName) {
  const engine = engines[engineName];
  if (!engine) {
    throw new Error(`Unknown storage engine "${engineName}". Discovered: ${Object.keys(engines).join(', ') || '(none)'}`);
  }
  if (!engine.module) {
    engine.module = require(path.join(engine.dir, engine.manifest.entrypoint));
  }
  return engine.module;
}

/**
 * Resolve which engine handles which storageType from config.
 *
 * New format:
 *   storages:
 *     baseStorage:
 *       engine: mongodb
 *     dataStore:
 *       engine: mongodb
 *     ...
 *
 * Legacy format (backward compat):
 *   storageEngine: mongodb           # unified override
 *   database:engine: mongodb         # per-component
 *   STORAGE_ENGINE env var           # testing override
 *
 * @param {Object} config - @pryv/boiler config instance
 */
function resolveConfig (config) {
  resolvedConfig = {};

  // Check for new-format storages config
  const hasNewFormat = config.has('storages');

  for (const storageType of VALID_STORAGE_TYPES) {
    let engineName;

    // 1. New-format explicit assignment
    if (hasNewFormat && config.has(`storages:${storageType}:engine`)) {
      engineName = config.get(`storages:${storageType}:engine`);
    }

    // 2. Legacy resolution
    if (!engineName) {
      engineName = resolveLegacyEngine(config, storageType);
    }

    if (engineName) {
      // Gather engine-specific config
      let engineConfig = {};
      if (hasNewFormat && config.has(`storages:${engineName}`)) {
        engineConfig = config.get(`storages:${engineName}`);
      }
      resolvedConfig[storageType] = { engine: engineName, config: engineConfig };
    }
  }
}

/**
 * Map legacy config keys to engine names for a given storageType.
 * @param {Object} config
 * @param {string} storageType
 * @returns {string|null}
 */
function resolveLegacyEngine (config, storageType) {
  // Global overrides (STORAGE_ENGINE env var or storageEngine config)
  const globalOverride = process.env.STORAGE_ENGINE ||
    (config.has('storageEngine') && config.get('storageEngine')) ||
    null;

  // Global override applies to database-backed types and platform;
  // series and file types are resolved independently below.
  if (globalOverride) {
    switch (storageType) {
      case 'seriesStorage':
        if (globalOverride === 'postgresql') return 'postgresql';
        return 'influxdb';
      case 'fileStorage':
        return 'filesystem';
      case 'auditStorage':
        return 'sqlite';
      default:
        return globalOverride;
    }
  }

  // Per-component legacy keys
  switch (storageType) {
    case 'baseStorage':
    case 'dataStore':
      if (config.has('database:engine')) {
        const e = config.get('database:engine');
        if (e) return e;
      }
      return 'mongodb'; // default for database-backed types

    case 'platformStorage':
      if (config.has('storagePlatform:engine')) {
        const e = config.get('storagePlatform:engine');
        if (e) return e;
      }
      return 'sqlite'; // default for platform

    case 'seriesStorage':
      // Series engine is independent: PG handles its own series,
      // otherwise InfluxDB is a standalone engine
      if (config.has('database:engine')) {
        const e = config.get('database:engine');
        if (e === 'postgresql') return 'postgresql';
      }
      return 'influxdb'; // default: standalone InfluxDB engine

    case 'fileStorage':
      return 'filesystem'; // always filesystem

    case 'auditStorage':
      return 'sqlite'; // always sqlite

    default:
      return null;
  }
}

/**
 * Initialize the plugin loader: discover engines, resolve config.
 * @param {Object} config - @pryv/boiler config instance
 */
async function init (config) {
  if (initialized) return;
  discover();
  validateEngineExports();
  resolveConfig(config);
  initialized = true;
}

/**
 * Get the resolved engine name for a storageType.
 * @param {string} storageType
 * @returns {string|null} Engine name or null if not configured
 */
function getEngineFor (storageType) {
  if (!resolvedConfig) {
    throw new Error('pluginLoader not initialized. Call init(config) first.');
  }
  const entry = resolvedConfig[storageType];
  return entry ? entry.engine : null;
}

/**
 * Get the engine-specific config for a storageType.
 * @param {string} storageType
 * @returns {Object} Engine config or empty object
 */
function getConfigFor (storageType) {
  if (!resolvedConfig) {
    throw new Error('pluginLoader not initialized. Call init(config) first.');
  }
  const entry = resolvedConfig[storageType];
  return entry ? entry.config : {};
}

/**
 * List all discovered engine names.
 * @returns {string[]}
 */
function listEngines () {
  return Object.keys(engines);
}

/**
 * Get manifest for a discovered engine.
 * @param {string} engineName
 * @returns {Object|null}
 */
function getManifest (engineName) {
  const engine = engines[engineName];
  return engine ? engine.manifest : null;
}

/**
 * Reset state (for testing).
 */
function reset () {
  for (const key of Object.keys(engines)) {
    delete engines[key];
  }
  resolvedConfig = null;
  initialized = false;
}

module.exports = {
  init,
  discover,
  getEngineFor,
  getConfigFor,
  getEngineModule,
  listEngines,
  getManifest,
  reset,
  REQUIRED_EXPORTS,
  VALID_STORAGE_TYPES
};
