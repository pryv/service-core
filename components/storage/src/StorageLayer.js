/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// MongoDB backends (current)
const Versions = require('./Versions');
const PasswordResetRequests = require('./PasswordResetRequests');
const Sessions = require('./Sessions');
const Accesses = require('./user/Accesses');
const Profile = require('./user/Profile');
const Streams = require('./user/Streams');
const Webhooks = require('./user/Webhooks');

// PostgreSQL backends
const VersionsPG = require('./VersionsPG');
const PasswordResetRequestsPG = require('./PasswordResetRequestsPG');
const SessionsPG = require('./SessionsPG');
const AccessesPG = require('./user/AccessesPG');
const ProfilePG = require('./user/ProfilePG');
const StreamsPG = require('./user/StreamsPG');
const WebhooksPG = require('./user/WebhooksPG');
const bluebird = require('bluebird');
const { getConfig, getLogger } = require('@pryv/boiler');
const { validateUserStorage } = require('./interfaces/UserStorage');
const { validateSessions } = require('./interfaces/Sessions');
const { validatePasswordResetRequests } = require('./interfaces/PasswordResetRequests');
const { validateVersions } = require('./interfaces/Versions');
const getStorageEngine = require('./getStorageEngine');

/**
 * 'StorageLayer' is a component that contains all the vertical registries
 * for various database models.
 *
 * Supports multiple storage engines: 'mongodb' (current), 'sqlite', 'postgresql'.
 * The engine is selected via the `storageEngine` config key (or legacy per-component keys).
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
    this.engine = getStorageEngine(config, 'database');

    const passwordResetRequestMaxAge = config.get('auth:passwordResetRequestMaxAge');
    const sessionMaxAge = config.get('auth:sessionMaxAge');

    switch (this.engine) {
      case 'mongodb':
        this._initMongoDB(connection, { passwordResetRequestMaxAge, sessionMaxAge });
        break;
      case 'sqlite':
        this._initSQLite(config, { passwordResetRequestMaxAge, sessionMaxAge });
        break;
      case 'postgresql':
        this._initPostgreSQL(connection, { passwordResetRequestMaxAge, sessionMaxAge });
        break;
      default:
        throw new Error(`Unknown storage engine: "${this.engine}"`);
    }

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
   * Initialize with MongoDB backends (current behavior).
   * @private
   */
  _initMongoDB (connection, options) {
    this.connection = connection;
    this.versions = new Versions(connection, this.logger);
    this.passwordResetRequests = new PasswordResetRequests(connection, {
      maxAge: options.passwordResetRequestMaxAge
    });
    this.sessions = new Sessions(connection, { maxAge: options.sessionMaxAge });
    this.accesses = new Accesses(connection);
    this.profile = new Profile(connection);
    this.streams = new Streams(connection);
    this.webhooks = new Webhooks(connection);
  }

  /**
   * Initialize with SQLite backends.
   * @private
   */
  _initSQLite (config, options) {
    // TODO: Phase 3 — implement SQLite backends for StorageLayer components
    throw new Error('SQLite StorageLayer not yet implemented. Use storageEngine: "mongodb" for now.');
  }

  /**
   * Initialize with PostgreSQL backends.
   * @param {import('./DatabasePG')} connection - DatabasePG instance
   * @private
   */
  _initPostgreSQL (connection, options) {
    this.connection = connection;
    this.versions = new VersionsPG(connection, this.logger);
    this.passwordResetRequests = new PasswordResetRequestsPG(connection, {
      maxAge: options.passwordResetRequestMaxAge
    });
    this.sessions = new SessionsPG(connection, { maxAge: options.sessionMaxAge });
    this.accesses = new AccessesPG(connection);
    this.profile = new ProfilePG(connection);
    this.streams = new StreamsPG(connection);
    this.webhooks = new WebhooksPG(connection);
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
