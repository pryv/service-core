/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
const storage = require('storage');

const { getConfigUnsafe, getLogger } = require('@pryv/boiler');
const config = getConfigUnsafe(true);

const database = storage.getDatabaseSync(true);

/**
 * Test process dependencies.
 */
module.exports = {
  settings: config.get(),
  storage: {
    database,
    versions: new storage.Versions(database, getLogger('versions')),
    passwordResetRequests: new storage.PasswordResetRequests(database),
    sessions: new storage.Sessions(database),
    user: {
      accesses: new storage.user.Accesses(database),
      followedSlices: new storage.user.FollowedSlices(database),
      streams: new storage.user.Streams(database), // TODO: reomove when mall is fully implemented for streams
      profile: new storage.user.Profile(database),
      webhooks: new storage.user.Webhooks(database)
    }
  },
  /**
   * Called by global.test.js to initialize async components
   */
  init: async function () {
  }
};
