/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const bluebird = require('bluebird');
const { getConfig, getLogger } = require('@pryv/boiler');
const { validateUserStorage } = require('storages/interfaces/baseStorage/UserStorage');
const { validateSessions } = require('storages/interfaces/baseStorage/Sessions');
const { validatePasswordResetRequests } = require('storages/interfaces/baseStorage/PasswordResetRequests');
const { validateVersions } = require('storages/interfaces/baseStorage/Versions');
const pluginLoader = require('storages/pluginLoader');

/**
 * 'StorageLayer' is a component that contains all the vertical registries
 * for various database models.
 *
 * Engine selection is handled by the pluginLoader — each engine plugin
 * provides an `initStorageLayer()` method that populates this instance.
 */
class StorageLayer {
  connection;
  engine;
  versions;
  passwordResetRequests;
  sessions;
  accesses;
  profile;
  streams;
  webhooks;
  logger;

  /**
   * Initialize the storage layer.
   * @param {Object} connection - Database connection (MongoDB Database instance,
   *   DatabasePG instance, or null for SQLite).
   */
  async init (connection) {
    if (this.connection != null) {
      this.logger.info('Already initialized');
      return;
    }

    const config = await getConfig();
    this.logger = getLogger('storage');

    await pluginLoader.init(config);
    this.engine = pluginLoader.getEngineFor('baseStorage');

    const passwordResetRequestMaxAge = config.get('auth:passwordResetRequestMaxAge');
    const sessionMaxAge = config.get('auth:sessionMaxAge');

    const engineModule = pluginLoader.getEngineModule(this.engine);
    engineModule.initStorageLayer(this, connection, {
      passwordResetRequestMaxAge,
      sessionMaxAge
    });

    // Validate all storage instances against their interface contracts
    validateUserStorage(this.accesses);
    validateUserStorage(this.profile);
    validateUserStorage(this.streams);
    validateUserStorage(this.webhooks);
    validateSessions(this.sessions);
    validatePasswordResetRequests(this.passwordResetRequests);
    validateVersions(this.versions);
  }

  /**
   * Async generator that yields ALL events across all users (no filtering).
   * Used for cross-user scans like integrity checking.
   */
  async * iterateAllEvents () {
    if (this.engine === 'mongodb') {
      const cursor = await bluebird.fromCallback(cb =>
        this.connection.findCursor({ name: 'events' }, {}, {}, cb)
      );
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        doc.id = doc._id;
        delete doc._id;
        delete doc.userId;
        yield doc;
      }
    } else {
      const { rowToEvent } = require('./localDataStorePG/localUserEventsPG');
      const res = await this.connection.query('SELECT * FROM events');
      for (const row of res.rows) {
        yield rowToEvent(row);
      }
    }
  }

  /**
   * @returns {Promise<any>}
   */
  async waitForConnection () {
    const database = this.connection;
    return await database.waitForConnection();
  }
}
module.exports = StorageLayer;
