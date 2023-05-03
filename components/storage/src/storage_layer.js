/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
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

class StorageLayer {
  connection;
  versions;
  passwordResetRequests;
  sessions;
  accesses;
  eventFiles;
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
    // placed here to avoid depencency cycles
    const EventFiles = require('./user/EventFiles');

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
    this.eventFiles = new EventFiles();
    await this.eventFiles.init();
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
