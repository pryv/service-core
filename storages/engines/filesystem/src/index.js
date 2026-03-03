/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Filesystem storage engine plugin.
 *
 * Provides local filesystem-based event file attachment storage.
 * Currently delegates to existing EventLocalFiles implementation;
 * code will be physically moved here in a later cleanup phase.
 */

// -- FileStorage --------------------------------------------------------

async function createFileStorage (_config, _internals) {
  const EventLocalFiles = require('./EventLocalFiles');
  return new EventLocalFiles();
}

module.exports = {
  createFileStorage
};
