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
  get userLocalDirectory () { return registry.userLocalDirectory; },
  get DeletionModesFields () { return registry.DeletionModesFields; },
  get localStoreEventQueries () { return registry.localStoreEventQueries; },
  get getEventFiles () { return registry.getEventFiles; },
  get SystemStreamsSerializer () { return registry.SystemStreamsSerializer; },
  get encryption () { return registry.encryption; },
  get createUserAccountStorage () { return registry.createUserAccountStorage; }
};
