/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const Versions = require('./Versions');
const PasswordResetRequests = require('./PasswordResetRequests');
const Sessions = require('./Sessions');
const Accesses = require('./user/Accesses');
const FollowedSlices = require('./user/FollowedSlices');
const Profile = require('./user/Profile');
const Streams = require('./user/Streams');
const Webhooks = require('./user/Webhooks');
const { getConfig, getLogger } = require('@pryv/boiler');

/**
 * 'StorageLayer' is a component that contains all the vertical registries
 * for various database models.
 */
class StorageLayer {
  connection;
  versions;
  passwordResetRequests;
  sessions;
  accesses;
  followedSlices;
  profile;
  streams;
  webhooks;
  logger;

  async init (connection) {
    if (this.connection != null) {
      this.logger.info('Already initialized');
      return;
    }

    const config = await getConfig();
    this.logger = getLogger('storage');
    const passwordResetRequestMaxAge = config.get('auth:passwordResetRequestMaxAge');
    const sessionMaxAge = config.get('auth:sessionMaxAge');
    this.connection = connection;
    this.versions = new Versions(connection, this.logger);
    this.passwordResetRequests = new PasswordResetRequests(connection, {
      maxAge: passwordResetRequestMaxAge
    });
    this.sessions = new Sessions(connection, { maxAge: sessionMaxAge });
    this.accesses = new Accesses(connection);
    // require() here to avoid depencency cycles
    this.followedSlices = new FollowedSlices(connection);
    this.profile = new Profile(connection);
    this.streams = new Streams(connection);
    this.webhooks = new Webhooks(connection);
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
