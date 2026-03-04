/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Engine-local internals registry.
 * Populated by the engine entry point's init() from barrel-provided values.
 * All engine files use require('./_internals') or require('../_internals')
 * instead of host require() calls.
 */
const registry = {};

module.exports = {
  set (name, value) { registry[name] = value; },
  /** Create a logger proxy that defers getLogger() until first use (safe at module scope). */
  lazyLogger (name) {
    let _log;
    const noop = () => {};
    return new Proxy({}, {
      get: (_, prop) => {
        if (!_log) {
          _log = registry.getLogger ? registry.getLogger(name) : { debug: noop, info: noop, warn: noop, error: noop };
        }
        const val = _log[prop];
        return typeof val === 'function' ? val.bind(_log) : val;
      }
    });
  },
  get databasePG () { return registry.databasePG; },
  get storageLayer () { return registry.storageLayer; },
  get DeletionModesFields () { return registry.DeletionModesFields; },
  get localStoreEventQueries () { return registry.localStoreEventQueries; },
  get getEventFiles () { return registry.getEventFiles; },
  get migrations () { return registry.migrations; },
  get MigrationContext () { return registry.MigrationContext; },
  get softwareVersion () { return registry.softwareVersion; },
  get SystemStreamsSerializer () { return registry.SystemStreamsSerializer; },
  get StreamProperties () { return registry.StreamProperties; },
  get integrityAccesses () { return registry.integrityAccesses; },
  get cache () { return registry.cache; },
  get encryption () { return registry.encryption; },
  get treeUtils () { return registry.treeUtils; },
  get createUserAccountStorage () { return registry.createUserAccountStorage; },
  get getLogger () { return registry.getLogger; }
};
